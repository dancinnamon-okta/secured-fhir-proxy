'use strict';
//Basic Fine grained access processor.
//Note: This processor is operating in a "FHIR edge" mode. 
//This means that the external FGA system only has security principal<->patient relationships.
//All internal FHIR<->FHIR relationships are intended to be kept within the FHIR database, and not FGA.
//FGA will only have relationships concerning security principals that are not represented within FHIR (the "edge" of FHIR).
//Before an FGA check is to occur, the applicable patient must be retrieved from the fhir object at runtime.
//For example, if an observation is requested, this module will first inspect the observation object, grab the applicable patient reference, and use that for FGA.
//The HL7 Patient compartment specification is used to determine how to derive the applicable patient for the FHIR resource.
//All references called out in the patient compartment will be sent to FGA for evaluation.  If any are approved by FGA- access is granted.

//TODO: In the future, we may want a seperate FGA model that relates external entities to other FHIR compartments. Right now, FGA is only handling the patient compartment.

const { CredentialsMethod, OpenFgaClient } = require('@openfga/sdk');

const actionMapping = {
    "POST": "can_write",
    "PUT": "can_write",
    "DELETE": "can_write",
    "GET": "can_view",
    "SEARCH": "can_view"
}

const compartment = require("../compartments/fhir_compartment")

//Given a FHIR object, this will return back the list of reference patients according to the patient compartment spec.
//TODO: Right now this will only return back linked patients- not practitioners or anything else.
//TODO: This will always link a Fhir resource back to a patient, and that's what I send to FGA.  Need to understand if I want to also do FGA checks on things like
//practitioners, etc.

//This will get any patient references that exist anywhere on the record, according to the patient compartment specification.
//All patient references will be sent to FGA.  If ANY of them return a positive relationship, access is granted.
async function getLinkedPatients(tenantConfig, fhirResource) {
    const linkedPrincipals = await compartment.getLinkedPrincipals(tenantConfig, 'Patient', fhirResource)
    var linkedPatients = linkedPrincipals.filter((principal) => principal.startsWith("Patient/")).map((patient) => patient.replace("Patient/", ""))
    if(fhirResource.resourceType === 'Patient') {
        linkedPatients.push(fhirResource.id)
    }
    return linkedPatients
}

//Given a FHIR resource, I'm going to make an FGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
async function performFGASingleResourceCheck(fgaClient, tenantConfig, authorizationContext, fhirObject, action) {
    const relationship = actionMapping[action]
    const linkedPatients = await getLinkedPatients(tenantConfig, fhirObject)
    const authorizedPrincipal = authorizationContext.externalAuthorizationPrincipal
    console.log("According to the compartment, the following patients are in scope for this request:")
    console.log(linkedPatients)

    for(var i=0; i<linkedPatients.length; i++) {
        const resource = `Patient:${linkedPatients[i]}`
        console.log("Making the following FGA Check:")
        console.log(`Security Principal: ${authorizedPrincipal}`)
        console.log(`Relationship: ${relationship}`)
        console.log(`Requested Object: ${resource}`)
        try {
            const fgaResult = await fgaClient.check({
                user: authorizedPrincipal,
                relation: relationship,
                object: resource
            });
            console.log('Result:')
            console.log(fgaResult)
            if(fgaResult.allowed) {
                console.log("Found a relationship!")
                return true
            }
        }
        catch(error) {
            console.log(error)
            return false
        }
    }
    return false
}

async function performFGABundleResourceCheck(fgaClient, tenantConfig, authorizationContext, fhirObject, action) {
    console.log("Bundle detected. Filtering the bundle...")
    if(fhirObject.entry) {
        var finalArray = []

        //Filter out the items the principal can't access.
        //TODO: there may be a faster way of doing this. Maybe run everyhting in parallel?
        for(var i=0;i<fhirObject.entry.length; i++) {
            if(await performFGASingleResourceCheck(fgaClient, tenantConfig, authorizationContext, fhirObject.entry[i].resource, action)) {
                finalArray.push(fhirObject.entry[i])
            }
        }

        fhirObject.entry = finalArray
        fhirObject.total = finalArray.length
    }

    return fhirObject
}


module.exports.performAuthorization = async (tenantConfig, authorizationContext, fhirObject, action) => {
    console.log("Performing fine grained filtering.")
    const fgaClient = getSDKConfig(tenantConfig);

    if(fhirObject.resourceType === "Bundle") {
        const filteredBundle = await performFGABundleResourceCheck(fgaClient, tenantConfig, authorizationContext, fhirObject, action)
        return {
            status: 200,
            authorizedData: filteredBundle
        }
    }
    else {
        if(await performFGASingleResourceCheck(fgaClient, tenantConfig, authorizationContext, fhirObject, action)) {
            return {
                status: 200,
                authorizedData: fhirObject
            }
        }
        else {
            return {
                status: 403,
                authorizedData: "You do not have access to this resource."
            }
        }
    }
}

module.exports.getAuthorizedList = async (tenantConfig, authorizationContext, fhirObject, action) => {
    console.log("Getting authorized list...")
    const relationship = actionMapping[action]
    const authorizedPrincipal = authorizationContext.externalAuthorizationPrincipal
    const fgaClient = getSDKConfig(tenantConfig);

    try {
        const fgaResult = await fgaClient.listObjects({
            user: authorizedPrincipal,
            relation: relationship,
            type: fhirObject
        });
        console.log('Result:')
        console.log(fgaResult.objects)
        return fgaResult.objects.map((fgaRecord) => fgaRecord.replace(`${fhirObject}:`, ''))
    }
    catch(error) {
        console.log(error)
        return false
    }
}

function getSDKConfig(tenantConfig) {
    var fgaClientConfig = {
        apiScheme: tenantConfig.fga_type == 'cloud' ? 'https' : 'http',
        apiHost: tenantConfig.fga_environment,
        storeId: tenantConfig.fga_store_id
    }

    if(tenantConfig.fga_type == 'cloud') {
        fgaClientConfig.credentials = {
            method: CredentialsMethod.ClientCredentials,
            config: {
                apiTokenIssuer: tenantConfig.fga_token_issuer,
                apiAudience: tenantConfig.fga_api_audience,
                clientId: tenantConfig.fga_client_id,
                clientSecret: tenantConfig.fga_client_secret
            }
        }
    }
    //At this point our state variables has everything populated, either from existing tenant, or from questionnaire.
    return new OpenFgaClient(fgaClientConfig);
}