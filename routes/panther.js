const devDebugger = require('debug')('dev');
const client = require('../startup/solr');
const { buildFieldQuery, buildGeneralQuery, buildFacetQuery } = require('../common/query');
const { validateSearchInput, validateTreeInput } = require('../models/panther');
const express = require('express');
const router = express.Router();

client.options.core = 'panther';
devDebugger('client: \n', client.options);

// search function
router.post('/search', async (req, res) => {
    devDebugger('body: ', JSON.stringify(req.body));
    const { error } = validateSearchInput(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const { searchText, start, rows, species, organisms, facet } = req.body;
    const q = buildGeneralQuery(searchText);
    const fq = buildFieldQuery({species, organisms});
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

    const query = client.query().q(req.params).start(0).rows(1).fl('family_name,speciation_events,jsonString,go_annotations');
    const result = await client.search(query);
    return res.status(200).send(result);
});

// get single tree go_annotation data
router.get('/go_annotations/:id', async (req, res) => {
    devDebugger('params: ', req.params);
    const { error } = validateTreeInput(req.params);
    if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q(req.params).start(0).rows(1).fl('go_annotations');
    const result = await client.search(query);
    return res.status(200).send(result);
});

router.get('/ids', async (req, res) => {
    devDebugger('params: ', req.params);
    // const { error } = validateTreeInput(req.params);
    // if (error) return res.status(400).send(error.details[0].message);

    const query = client.query().q('*:*').start(0).rows(300)
        .fl('id,uniprot_ids');
    const result = await client.search(query);
    return res.status(200).send(result);
});

module.exports = router;