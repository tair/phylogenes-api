function buildGeneralQuery(searchText) {
    var q = "";
    if(searchText != null && searchText != "") {
        q += " AND exactMatch:\"" + searchText + "\"^10";
        // q += " OR gene_symbols:\"" + searchText + "\""; //phg-83
        q += " OR family_name:\"" + searchText + "\"~10";
        q += " OR sf_names:\"" + searchText + "\"~10";
        q += " OR gene_ids:\"" + searchText + "\" ";
        q += " OR uniprot_ids:\"" + searchText + "\" ";
    }
    q = q.substr(5);
    if(q == "")
        q = "*:*";
    return q;
}

function buildFieldQuery(filters){
    let fqObj = {};
    const fq = []
    for (var i = 0; i < filters.species.length; i++) {
        fqObj = { field: 'species_list', value: `"${filters.species[i]}"` };
        fq.push(fqObj);
    }
    for (var i = 0; i < filters.organisms.length; i++) {
        fqObj = { field: 'organisms', value: `"${filters.organisms[i]}"` };
        fq.push(fqObj);
    }
    return fq;
}

function buildFacetQuery(query){
    let facetQuery = '';
    if (query && query.facet=='on'){
        facetQuery  = 'facet.field=node_types&facet.field=organisms&facet.field=species_list&facet=on';
    }
    return facetQuery;
}

module.exports = {
    buildFieldQuery,
    buildGeneralQuery,
    buildFacetQuery
}