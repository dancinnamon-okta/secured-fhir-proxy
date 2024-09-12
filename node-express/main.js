const express = require('express');
const metadataEndpoint = require('./metadata_endpoints')
const readEndpoint = require('./read_operation')
const searchEndpoint = require('./search_operation')
const matchEndpoint = require('./match_operation')

const app = express();

app.use(express.json())

//By default, all my responses will be application/json.
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

metadataEndpoint.connect(app);
readEndpoint.connect(app);
searchEndpoint.connect(app);
matchEndpoint.connect(app);

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});