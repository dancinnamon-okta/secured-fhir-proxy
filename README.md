# smart-authorized-fhir-proxy
A reference implementation of a multi-tenant, secured FHIR API.

## Features
The goal of this repository is to create a "multi-tenant" FHIR proxy that enables the ability to quickly and efficiently research new healthcare interoperability standards.  Each "tenant" in this proxy can be configured to support various security features such as:
* Support for a completely seperate authorization server per tenant
* Ability to support SMART v1 and SMART v2
* Ability to optionally support UDAP
* Ability to optionally support Fine grained access control using https://fga.dev

## High Level Onboarding Steps
A more complete onboarding guide is a work in progress- however here are some general guidelines for deploying this reference implementation.

### Pre-Steps
 - Determine what domain name you'll be using for your FHIR service
 - Determine what you'll be using for your authorization service
 - Ensure that your top level domain used for your FHIR service is managed by AWS Route 53 for automatic deployment
 - Install and configure the [serverless framework](https://www.serverless.com/framework/docs/getting-started) for your AWS tenant

*Note: The steps outlined in this guide are for the most fully automated onboarding process possible- if other DNS services are used, or other FHIR services are used- applicable existing services may be substituted in (but you're more "on your own")*

### Step 1- Initial Config of serverless.yml
- Copy serverless.example.yml to serverless.yml
- Fill out the FHIR_BASE_DOMAIN, FHIR_BASE_TLD, and BACKEND_FHIR_SERVICE_URL parameters.
- Create the certificate in ACM: `sls create-cert --verbose -c serverless.yml`
- Create the domain configuration in AWS Route 53: `sls create_domain --verbose -c serverless.yml`

### Step 2- Initial Config of tenants.json
- Copy tenants.example.json to tenants.json
- Add/Update the "demo" tenant
- Fill in values as appropriate

*Note: This project is designed to have as many tenants as you'd like. Each tenant is accessed by a "tenant prefix" in the FHIR URL, and should be included in your base FHIR url that you supply to clients.  For example, the included "demo" tenant is available at https://fhir.yourdomain.tld/demo, and you'd access a patient record at https://fhir.yourdomain.tld/demo/Patient/patient_id*

### Step 3- Deploy
- Deploy the FHIR service: `sls deploy --verbose -c serverless.yml`
- Test the FHIR service by visiting: https://fhir.yourdomain.tld/.well-known/smart-configuration
