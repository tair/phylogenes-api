const devDebugger = require('debug')('dev');
const https = require('https');
const config = require('config');
const client = require('../startup/solr');
const { buildFieldQuery, buildGeneralQuery, buildFacetQuery } = require('../common/query');
const { validateSearchInput, validateTreeInput, validateAgiInput } = require('../models/panther');
const express = require('express');
const router = express.Router();

const TREE_S3_BASE = config.get('treeS3Url');
const MSA_S3_BASE = config.get('msaS3Url');
const ORTHOLOGS_S3_BASE = config.get('orthologsS3Url');
const PARALOGS_S3_BASE = config.get('paralogsS3Url');
const ORTHOLOGS_DL_S3_BASE = config.get('orthologsDownloadS3Url');
const PARALOGS_DL_S3_BASE = config.get('paralogsDownloadS3Url');
// Objects known to exist in every bucket, used to tell a missing key from denied access.
const PROBE_FAMILY_ID = config.has('s3ProbeFamilyId') ? config.get('s3ProbeFamilyId') : 'PTHR10000';
const PROBE_AGI = config.has('s3ProbeAgi') ? config.get('s3ProbeAgi') : 'AT1G01010';
const PROBE_TTL_MS = 60 * 1000;
const probeCache = new Map(); // probe URL -> { expires, result: Promise<boolean> }

// True when the bucket serves its known object, i.e. public reads work. Cached for a
// minute per bucket so a burst of missing keys costs one extra request, not one each.
function bucketReadable(probeUrl) {
    const cached = probeCache.get(probeUrl);
    if (cached && cached.expires > Date.now()) return cached.result;
    const result = new Promise((resolve) => {
        const req = https.request(probeUrl, { method: 'HEAD', timeout: 5000 }, (s3) => {
            s3.resume();
            resolve(s3.statusCode === 200);
        });
        req.on('timeout', () => req.destroy(new Error('probe timeout')));
        req.on('error', (err) => { devDebugger('S3 probe error: ', err.message, probeUrl); resolve(false); });
        req.end();
    });
    probeCache.set(probeUrl, { expires: Date.now() + PROBE_TTL_MS, result });
    return result;
}

function pipeS3(url, res, contentType, probeUrl) {
    const fail = (err) => {
        if (res.headersSent) { res.destroy(err); return; }
        // strip the success-path Cache-Control so an error response isn't cached for 24h
        res.removeHeader('Cache-Control');
        res.status(502).send({ error: err.message });
    };
    https.get(url, (s3) => {
        if (s3.statusCode !== 200) {
            // Log the real S3 status; the response below may differ from it.
            devDebugger('S3 response: ', s3.statusCode, url);
            s3.resume();
            if (s3.statusCode === 403 || s3.statusCode === 404) {
                // The buckets are public-read without ListBucket, so S3 answers a missing
                // key with 403, but it also answers 403 when reads are denied, and 404 for
                // a bucket that doesn't exist. Check an object known to exist: if that
                // reads, the key is missing (404, so callers can tell "no file for this
                // id", TAIR3-1098); otherwise the bucket is unavailable (502).
                bucketReadable(probeUrl).then((readable) => {
                    if (readable) {
                        res.status(404).send({ error: 'not found' });
                    } else {
                        devDebugger('S3 bucket not readable: ', probeUrl);
                        res.status(502).send({ error: 'upstream bucket not readable' });
                    }
                });
            } else {
                res.status(502).send({ error: `upstream ${s3.statusCode}` });
            }
            return;
        }
        s3.on('error', (err) => { devDebugger('S3 stream error: ', err.message); fail(err); });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        s3.pipe(res);
    }).on('error', (err) => { devDebugger('S3 proxy error: ', err.message); fail(err); });
}

client.options.core = 'panther';
devDebugger('client: \n', client.options);

// search function
router.post('/search', async (req, res) => {
    devDebugger('body: ', JSON.stringify(req.body));
    const { error } = validateSearchInput(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const { searchText, start, rows, species, organisms, facet } = req.body;
    const q = buildGeneralQuery(searchText);
    const fq = buildFieldQuery({ species, organisms });
    const fcq = buildFacetQuery(facet);
    const query = client.query()
        .facetQuery(fcq)
        .fl('id,sf_names,family_name,node_types,gene_symbols,uniprot_ids')
        .rows(rows)
        .start(start)
        .q(q)
        .fq(fq)
        .hlQuery('&hl=on&hl.fl=sf_names,%20gene_symbols,%20family_name');
    devDebugger('solr query: ', query);
    const result = await client.search(query);
    return res.status(200).send(result);
});

// get single tree info
router.get('/tree/:id', async (req, res) => {
    devDebugger('params: ', req.params);
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q(req.params).start(0).rows(1).fl('family_name,speciation_events,jsonString,go_annotations,publications');
    const result = await client.search(query);
    return res.status(200).send(result);
});

// get single tree go_annotation data
router.get('/go_annotations/:id', async (req, res) => {
    devDebugger('params: ', req.params);
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q(req.params).start(0).rows(1).fl('family_name,taxonomic_ranges,go_annotations');
    const result = await client.search(query);
    return res.status(200).send(result);
});

//get single tree publications data
router.get('/publications/:id', async (req, res) => {
    devDebugger('params: ', req.params);
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q(req.params).start(0).rows(1).fl('family_name,publications_count');
    const result = await client.search(query);
    return res.status(200).send(result);
});

// get single tree msa data
router.get('/msa/:id', async (req, res) => {
    devDebugger('params: ', req.params);
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q(req.params).start(0).rows(1).fl('msa_data');
    const result = await client.search(query);
    return res.status(200).send(result);
});

// proxy panther tree JSON from S3 (avoids browser CORS on the bucket)
router.get('/tree-data/:id', (req, res) => {
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${TREE_S3_BASE}${req.params.id}.json`, res, 'application/json', `${TREE_S3_BASE}${PROBE_FAMILY_ID}.json`);
});

// proxy panther MSA JSON from S3 (avoids browser CORS on the bucket)
router.get('/msa-data/:id', (req, res) => {
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${MSA_S3_BASE}${req.params.id}.json`, res, 'application/json', `${MSA_S3_BASE}${PROBE_FAMILY_ID}.json`);
});

// proxy ortholog JSON for a TAIR locus (avoids browser CORS on the bucket)
router.get('/orthologs/:id', (req, res) => {
    const { error } = validateAgiInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${ORTHOLOGS_S3_BASE}${req.params.id}.json`, res, 'application/json', `${ORTHOLOGS_S3_BASE}${PROBE_AGI}.json`);
});

// proxy paralog JSON for a TAIR locus
router.get('/paralogs/:id', (req, res) => {
    const { error } = validateAgiInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${PARALOGS_S3_BASE}${req.params.id}.json`, res, 'application/json', `${PARALOGS_S3_BASE}${PROBE_AGI}.json`);
});

// proxy ortholog .txt download for a TAIR locus
router.get('/orthologs-download/:id', (req, res) => {
    const { error } = validateAgiInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${ORTHOLOGS_DL_S3_BASE}${req.params.id}_ortholog.txt`, res, 'text/plain',
        `${ORTHOLOGS_DL_S3_BASE}${PROBE_AGI}_ortholog.txt`);
});

// proxy paralog .txt download for a TAIR locus
router.get('/paralogs-download/:id', (req, res) => {
    const { error } = validateAgiInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3(`${PARALOGS_DL_S3_BASE}${req.params.id}_paralog.txt`, res, 'text/plain',
        `${PARALOGS_DL_S3_BASE}${PROBE_AGI}_paralog.txt`);
});

module.exports = router;