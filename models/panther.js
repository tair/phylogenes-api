const Joi = require('joi');

const searchInputSchema = Joi.object().keys({
  searchText: Joi.any(),
  rows: Joi.number().required(),
  start: Joi.number().required(),
  species: Joi.array().required(),
  organisms: Joi.array().required(),
  facet: Joi.string().valid(['on', 'off'])
});

const treeInputSchema = Joi.object().keys({
  id: Joi.string().regex(/^PTHR[0-9]{5,}$/).error(err=>{return {message: 'Invalid tree id'}}),
});

function validateSearchInput(queryObj) {
  return Joi.validate(queryObj, searchInputSchema);
}

function validateTreeInput(queryObj){
  return Joi.validate(queryObj, treeInputSchema);
}

module.exports= {
  validateSearchInput,
  validateTreeInput,
}