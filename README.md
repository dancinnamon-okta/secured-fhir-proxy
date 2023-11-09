# smart-authorized-fhir-proxy
A reference implementation of a multi-tenant, secured FHIR API.

## Overview
The goal of this repository is to create a "multi-tenant" FHIR proxy that enables the ability to quickly and efficiently research new and varied healthcare interoperability security standards such as UDAP, SMART launch framework, and the FAST Identity implementation guide. This proxy will sit in front of an existing, non-secured FHIR service. You may provide this FHIR service yourself, or https://hapi.fhir.org is also an excellent, publicly available resource.

***Note- this proxy currently only supports read/search/$match operations.***

Each "tenant" in this proxy can be configured to support different security features such as:
* Support for a completely seperate authorization server per tenant
* Ability to support SMART v1 and SMART v2 authorization models
* Ability to optionally support UDAP
* Ability to optionally support Fine grained access control using https://fga.dev

## Authorization Model
Another primary goal of this repository is to serve as a reference implementation for properly securing FHIR resources using OAuth2 access tokens. It proposes both coarse grained as well as fine grained access control strategies.  

### Authorization Overview
The following block diagram outlines the strategy that every FHIR request goes through:

![High Level Architecture](./doc/high_level_authorization_flow.png)

**Global Authorizer:** 

This component will do basic access token validation checks to ensure a valid access token has been provided by the client. This module runs regardless of access control model selected.

**Scope Processor:** 

This component will do basic matching of requested resource and scopes granted to the access token. For example, if Patient/123 is requested, the token must include a <user|system|patient>/Patient.<read|r|*> scope. This module runs regardless of access control model selected.

**CGA Processor (Coarse Grained Access Processor):**

This processor runs under 2 conditions:
1. Tenant configuration defines the use of CGA vs. FGA.
2. If a patient/* scope is granted to the access token.  

CGA is always used to process patient/* tokens because these tokens are, by definition, only scoped to ONE patient, and therefore additional FGA processing doesn't apply.

For system/* tokens, no additional authorization checks are performed. Full read access to all records is allowed.

For user/* scopes, the CGA processor uses relatively basic logic to determine if a security principal is allowed to access a given resource. It uses well known FHIR "compartment" principals to determine access.

The processor takes in an inbound FHIR security principal, as well as the FHIR object being requested. The FHIR security principal will be a Patient|Practitioner|RelatedPerson, and the FHIR object will be any FHIR object.

To allow access, the processor will first pull the relevant compartment for the inbound security principal, and it will use that compartment to determine which attributes to inspect to find a reference to the inbound security principal.  If the inbound security principal is found in any of the referenced attributes, access is granted.

Example:
A Practitioner with ID 1234 is using an application, and they attempt to view an Encounter with ID 4567.
In this scenario, the Security principal is Practitioner/1234, and the FHIR Object is Encounter/4567

Steps taken:
1. Load up a cache of the practitioner compartment
2. Look up the applicable attributes for the "encounter" object.
3. It is discovered that, according to the compartment, that a practitioner may be referenced in the following fields on the encounter: Encounter.participant.actor.reference, OR Encounter.participant.actor.reference
4. Both fields are checked on the requested record (encounter 4567 in this case), and if either field is equal to "Practitioner/1234", then access is granted.

![CGA Example](./doc/cga_example.png)

**FGA Processor (Fine Grained Access Processor):**
This processor runs under 2 conditions:
1. Tenant configuration defines the use of FGA- AND
2. If a user/* or system/* scope is granted.

The FGA processor works in a similar fashion to the CGA processor. When a security principal requests access to a FHIR object, the patient compartment definition is used to compile a list of "applicable patients" that the FHIR object is related to.  Once a list of applicable patients is compiled, each one, along with the security principal- is sent to Okta FGA to check for access.  How this access is granted is not our concern, but rather the concern of the FGA system. This logic has the benefit of being simpler than the GGA processor, due to externalization of complexity to the FGA platform.

Another aspect to understand here is that, with the FGA model- the security principal does not need to be a FHIR resource! This opens the door for new use cases such as 3rd party access for trust community member, removes the need for RelatedPerson records for authorized representatives, and other such similar use cases.

Example:
A Practitioner with ID 1234 is using an application, and they attempt to view an Encounter with ID 4567. Encounter 4567 is associated with Patient/8901.
In this scenario, the Security principal is Practitioner/1234, and the FHIR Object is Encounter/4567

Steps taken:
1. Load up a cache of the patient compartment
2. Look up the applicable attributes for the "encounter" object.
3. It is discovered that, according to the compartment, that a patient may be referenced in the following fields on the encounter: Encounter.subject.reference
4. If found, the value for Encounter.subject.reference is retrieved (Patient/8901), and an FGA check is performed to determine if Practitioner/1234 has a "can_view" relationship with Patient/8901. Access is granted if the FGA system responds with an affirmative result.

![FGA Example](./doc/fga_example.png)

It should be noted that the FGA processor also works in system/* mode- enabling partial access in B2B, machine to machine processes driven by the external fine grained access platform.

## Installation
A more complete onboarding guide is a work in progress- however here are some general guidelines for deploying this reference implementation.

### Pre-Steps
 - Determine what domain name you'll be using for your FHIR service
 - Determine what you'll be using for your authorization service
 - Ensure that your top level domain used for your FHIR service is under your control
 - Install and configure the [serverless framework](https://www.serverless.com/framework/docs/getting-started) for your AWS tenant
 - Obtain a domain name managed by AWS Route 53.  Not strictly required, but without this setup, more DNS work will need to be done manually.

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