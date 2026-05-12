const devDebugger = require('debug')('dev');
const https = require('https');
const config = require('config');
const client = require('../startup/solr');
const { buildFieldQuery, buildGeneralQuery, buildFacetQuery } = require('../common/query');
const { validateSearchInput, validateTreeInput } = require('../models/panther');
const express = require('express');
const router = express.Router();

const TREE_S3_BASE = config.get('treeS3Url');
const MSA_S3_BASE = config.get('msaS3Url');

function pipeS3Json(url, res) {
    const fail = (err) => {
        if (res.headersSent) { res.destroy(err); return; }
        res.status(502).send({ error: err.message });
    };
    https.get(url, (s3) => {
        if (s3.statusCode !== 200) {
            res.status(s3.statusCode).send({ error: `upstream ${s3.statusCode}` });
            s3.resume();
            return;
        }
        s3.on('error', (err) => { devDebugger('S3 stream error: ', err.message); fail(err); });
        res.setHeader('Content-Type', 'application/json');
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
    pipeS3Json(`${TREE_S3_BASE}${req.params.id}.json`, res);
});

// proxy panther MSA JSON from S3 (avoids browser CORS on the bucket)
router.get('/msa-data/:id', (req, res) => {
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);
    pipeS3Json(`${MSA_S3_BASE}${req.params.id}.json`, res);
});

module.exports = router;