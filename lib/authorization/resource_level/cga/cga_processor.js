'use strict';
//Coarse grained access processor.
//This method operates in a mode where an inbound principal is passed in that represents the requestor of the data.
//That requester must be somewhere called on the requested resource.
//I am using the applicable FHIR compartment definition to determine where on the record i'm going to look for the security principal.
//I also check the ID of the resource directly.

//For example- if the inbound principal is a practitioner, I use the practitioner compartment to determine how to relate to the requested FHIR object.
//I am currently supporting, as inbound principals, Patient, Practitioner, and RelatedPerson types.

//2 modes of operation- 
//"user" and "patient" mode- i'm taking in a principal (fhirUser claim, or selected patient), and matching it against the FHIR data as described.
//"system" mode is meant for B2B use cases, and contains no additional checks at all- no record-level access checks are performed.

//TODO: What if the fhirAuthorizationPrincipal is null? In general i'd like to rationalize how I'm getting my security principal with the FGA model.

const compartment = require("../compartments/fhir_compartment")

//fhirObject is the actual Patient/Observation/Encounter/etc. object from the database.
//authorizedPrincipal is the inbound user for evaluation in ResourceType/ID format.  For example Patient/123, or Practitioner/456.
//Example 1- inbound user is Patient/123- access is allowed to Patient 123, and also any Observation where Patient/123 is in subject, or in performer reference.
//Example 2- inbound user is Practitioner/123- access is allowed to Practitioner 123, and any other object where practitioner is referenced. Observation/performer for example.
async function matchesIdOrSubject(tenantConfig, authorizedPrincipal, fhirObject) {
    const fhirIdentifier = `${fhirObject.resourceType}/${fhirObject.id}`
    const securityPrincipalType = authorizedPrincipal.split('/')[0]

    console.log(`Checking to see if ${authorizedPrincipal} has access to: ${fhirIdentifier}`)
    const linkedPrincipals = await compartment.getLinkedPrincipals(tenantConfig, securityPrincipalType, fhirObject)
    
    return authorizedPrincipal === fhirIdentifier || linkedPrincipals.includes(authorizedPrincipal)
}

//Given a FHIR resource, I'm going to make an CGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
async function performSingleResourceCheck(tenantConfig, authorizationContext, fhirObject) {
    if(['patient','user'].includes(authorizationContext.authorizationMode)) {
        return await matchesIdOrSubject(tenantConfig, authorizationContext.fhirAuthorizationPrincipal, fhirObject)
    }
    else {
        return true
    }
}

//Given a FHIR resource, I'm going to make an FGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
async function performBundleResourceCheck(tenantConfig, authorizationContext, fhirObject) {
    console.log("Performing coarse grained bundle filtering.")
    //If we're in patient/user mode let's filter to what we're authorized for.  For system mode we don't filter at all.
    if(['patient','user'].includes(authorizationContext.authorizationMode) && fhirObject.total > 0) {
        var finalArray = []
 
        for(var i=0;i<fhirObject.entry.length - 1; i++) {
            if (await performSingleResourceCheck(tenantConfig, authorizationContext, fhirObject.entry[i].resource)) {
                console.log("User has access!")
                finalArray.push(fhirObject.entry[i])
            }
        }

        fhirObject.entry = finalArray
        fhirObject.total = finalArray.length
        
    }

    return fhirObject
}

module.exports.performAuthorization = async (tenantConfig, authorizationContext, fhirObject, action) => {
    console.log("Performing coarse grained filtering.")

    if(fhirObject.resourceType === "Bundle") {
        const filteredBundle = await performBundleResourceCheck(tenantConfig, authorizationContext, fhirObject)
        return {
            status: 200,
            authorizedData: filteredBundle
        }
    }
    else {
        if(await performSingleResourceCheck(tenantConfig, authorizationContext, fhirObject)) {
            console.log("User has access!")
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