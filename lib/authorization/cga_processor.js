//Coarse grained access processor.
//This method is mainly here to make sure that if we're in 'single patient' mode- that all FHIR resources going out are:
//That patient record exactly, OR
//Has a subject that matches the patient.

//Similarly- for 'user' mode, I expect a fhirUser claim.  I expect the id of the fhirresource to:
// match the fhirUser exactly by ID, OR the subject shall match the fhirUser claim.

//If I'm in 'system' mode- no filtering will occur at all.

matchesIdOrSubject = (authorizedPrincipal, fhirObject) => {
    console.log(`Checking to see if ${authorizedPrincipal} has access to: ${fhirObject.id}`)
    const fhirIdentifier = `${fhirObject.resourceType}/${fhirObject.id}`
    const fhirSubject = (fhirObject.subject && fhirObject.subject.reference) ? fhirObject.subject.reference : ''
    return authorizedPrincipal === fhirIdentifier || authorizedPrincipal === fhirSubject
}

//Given a FHIR resource, I'm going to make an CGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
performSingleResourceCheck = (authorizationContext, fhirObject) => {
    if(['patient','user'].includes(authorizationContext.authorizationMode)) {
        return matchesIdOrSubject(authorizationContext.fhirAuthorizationPrincipal, fhirObject)
    }
    else {
        return true
    }
}

//Given a FHIR resource, I'm going to make an FGA check to see if the principal has access to that resource.
//This model links everything back to the patient, and all FGA is based at the patient level currently.
performBundleResourceCheck = (authorizationContext, fhirObject) => {
    console.log("Performing coarse grained bundle filtering.")
    //If we're in patient/user mode let's filter to what we're authorized for.  For system mode we don't filter at all.
    if(['patient','user'].includes(authorizationContext.authorizationMode) && fhirObject.total > 0) {
        var finalArray = []
 
        for(var i=0;i<fhirObject.entry.length - 1; i++) {
            if (performSingleResourceCheck(authorizationContext, fhirObject.entry[i].resource)) {
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
        const filteredBundle = performBundleResourceCheck(authorizationContext, fhirObject)
        return {
            status: 200,
            authorizedData: filteredBundle
        }
    }
    else {
        if(performSingleResourceCheck(authorizationContext, fhirObject)) {
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