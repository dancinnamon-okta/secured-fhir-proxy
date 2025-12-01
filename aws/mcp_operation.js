'use strict';
//I'm just testing this for now. 
//I'll likely move EVERYTHING over to using express with proxy 
//to keep everything simple.

const serverlessExpress = require('@codegenie/serverless-express');
const express = require('express');
const mcpEndpoint = require('../node-express/mcp_endpoint')

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

mcpEndpoint.connect(app);

exports.mcpHandler = serverlessExpress({ app })
//const server = awsServerlessExpress.createServer(app);

/*
module.exports.mcpHandler = async (event, context) => {
	return awsServerlessExpress.proxy(server, event, context)
}*/