const NodeCache = require("node-cache");

const memCache = new NodeCache({ stdTTL: 20, checkperiod: 40 });
module.exports = { memCache }