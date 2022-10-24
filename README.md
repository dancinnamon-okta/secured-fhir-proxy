# smart-authorized-fhir-proxy
A reference implementation of a SMART authorized FHIR API

## High Level Onboarding Steps
A more complete onboarding guide is a work in progress- however here are some general guidelines for deploying this reference implementation of SMART/FHIR with auth0!

### Pre-Steps
 - Determine what domain name you'll be using for your FHIR service
 - Determine what domain name you'll be using for your SMART service
 - Ensure that your top level domain(s) used for your services are managed by AWS Route 53 for automatic deployment
 - Install and configure the [serverless framework](https://www.serverless.com/framework/docs/getting-started) for your AWS tenant

*Note: The steps outlined in this guide are for the most fully automated onboarding process possible- if other DNS services are used, or other FHIR services are used- applicable existing services may be substituted in (but you're more "on your own")*

### Step 1- Deploy the reference FHIR Service (if you're using it)
- Copy serverless-fhir.example.yml to serverless-fhir.yml
- Fill out the FHIR_BASE_DOMAIN, FHIR_BASE_TLD, and AUTHZ_BASE_DOMAIN parameters.
- Create the certificate in ACM: `sls create-cert --verbose -c serverless-fhir.yml`
- Create the domain configuration in AWS Route 53: `sls create_domain --verbose -c serverless-fhir.yml`
- Deploy the FHIR service: `sls deploy --verbose -c serverless-fhir.yml`
- Test the FHIR service by visiting: https://fhir.yourdomain.tld/.well-known/smart-configuration
