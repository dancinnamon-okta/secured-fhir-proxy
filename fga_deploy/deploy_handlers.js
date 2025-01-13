const utils = require('./deploy_utils')
const { CredentialsMethod, OpenFgaClient } = require('@openfga/sdk')
const fs = require('fs')
const axios = require('axios')

const MAX_PAGE_COUNT = 100

module.exports.handlers = {
    handle_deploy_questionnaire: async (rl, state) => {
        console.log('Collecting general configuration information...')
        state.proxyTenant = await utils.askPattern(rl, 'Which proxy tenant (from your tenants.json file) would you like to maintain? (Example: localdockerdemo)', /.+/)

        state.deployNewStore = await utils.askSpecific(rl, 'Would you like to start with a new FGA system, or use an existing one associated with your proxy tenant? (new/existing)', ['new','existing'])

        if(state.deployNewStore == 'existing') {
            state.updateModel = await utils.askSpecific(rl, 'Would you like to update the authorization model? If not, only tuple data will be maintained. (y/n)', ['y','n'])
        }
        else {
            console.log('For help with the following questions, please refer to: https://docs.fga.dev/integration/getting-your-api-keys')
            state.fgaType = await utils.askSpecific(rl, 'What type of FGA environment are you connecting to? (docker/cloud)', ['docker','cloud'])
            state.fgaEnvironment = await utils.askPattern(rl, 'What FGA hostname are you connecting to? (Use "api.us1.fga.dev" for free trial, or "openfga:8080" for the docker example)', /.+/)
            state.fgaStoreName = await utils.askPattern(rl, 'What would you like to name your new FGA system?', /.+/)
            if(state.fgaType == 'cloud') {
                state.fgaStoreId = await utils.askPattern(rl, 'What FGA Store ID are you going to maintain (get the store ID from the FGA console)?', /.+/)
                state.fgaTokenIssuer = await utils.askPattern(rl, 'What is your FGA token Issuer? (Use fga.us.auth0.com for free trial)', /.+/)
                state.fgaApiAudience = await utils.askPattern(rl, 'What is your FGA token Audience? (Use https://api.us1.fga.dev/ for free trial)', /.+/)
                state.fgaClientId = await utils.askPattern(rl, 'What is your FGA API client id?', /.+/)
                state.fgaClientSecret = await utils.askPattern(rl, 'What is your FGA API client secret?', /.+/)
            }
        }

        state.deployTestOrg = await utils.askSpecific(rl, 'Would you like a sample healthcare organization hierarchy populated? (y/n)', ['y','n'])
        state.populateOrgWithFHIRPatients = await utils.askSpecific(rl, 'Would you like to insert relationships for existing FHIR patients? (y/n)', ['y','n'])
        state.distributePatientsThroughoutOrg = await utils.askSpecific(rl, 'Would you like to randomly associate the patients throughout the organization? (y/n)', ['y','n'])

        state.createSampleUser = await utils.askSpecific(rl, 'Would you like to create a sample user? (y/n)', ['y','n'])

        if(state.createSampleUser == 'y') {
            state.sampleUser = await utils.askPattern(rl, 'If you would like to assign a test user with global access, type in their user id here.', /.+/)
        }

        if(state.populateOrgWithFHIRPatients == 'y') {
            state.backendFhirUrl = await utils.askPattern(rl, 'What is the backend FHIR URL for your proxy? (If using the local docker example it is: http://fhir:8080/fhir)', /.+/)
        }
        console.log('All set! Current configuration:')
        console.log(state)
    },

    handle_validate_tenant_config: async (rl, state) => {
        let tenantConfig = JSON.parse(fs.readFileSync(process.env.TENANTS_CONFIG_FILE)).filter(config => config.id === state.proxyTenant)
        const configIndex = tenantConfig.findIndex(config => config.id === state.proxyTenant)
        if(tenantConfig.length > 0) {
            console.log("Tenant Config verified...")
            if(state.deployNewStore == 'existing') {
                console.log('User chose to maintain an existing FGA store- loading FGA details from tenants.json...')
                state.fgaType = tenantConfig[configIndex].fga_type
                state.fgaEnvironment = tenantConfig[configIndex].fga_environment
                state.fgaTokenIssuer = tenantConfig[configIndex].fga_token_issuer
                state.fgaApiAudience = tenantConfig[configIndex].fga_api_audience
                state.fgaStoreId = tenantConfig[configIndex].fga_store_id
                state.fgaClientId = tenantConfig[configIndex].fga_client_id
                state.fgaClientSecret = tenantConfig[configIndex].fga_client_secret
            }
        }
        else {
            console.error('Unable to load the existing tenant config. Exiting... Ensure that you have input a valid tenant id in the questionnaire.')
            throw new Error('Unable to load existing tenant config from tenants.json.')
        }
    },

    handle_populate_model: async (rl, state) => {
        if(state.updateModel == 'n') {
            console.log('Skipping FGA model maintenance- user chose to leave current model in place.')
            return
        }

        //Load up our existing tenant config so we can update it.
        let tenantConfig = JSON.parse(fs.readFileSync(process.env.TENANTS_CONFIG_FILE))
        const configIndex = tenantConfig.findIndex(config => config.id === state.proxyTenant)

        //At this point our state variables has everything populated, either from existing tenant, or from questionnaire.
        const fgaClient = getSDKConfig(state);
        const newModel = JSON.parse(fs.readFileSync("./model/current_model.json"))

        const newStore = await fgaClient.createStore({
            name: state.fgaStoreName
        })
        state.fgaStoreId = newStore.id
        fgaClient.storeId = newStore.id

        const modelResult = await fgaClient.writeAuthorizationModel(newModel)
        state.fgaModelId = modelResult.authorization_model_id
        console.log(`Successfully created model. ID: ${state.fgaModelId}`)
        
        console.log('Updating your tenant config...')
        tenantConfig[configIndex].fga_type = state.fgaType
        tenantConfig[configIndex].fga_environment = state.fgaEnvironment
        tenantConfig[configIndex].fga_token_issuer = state.fgaTokenIssuer
        tenantConfig[configIndex].fga_api_audience = state.fgaApiAudience
        tenantConfig[configIndex].fga_store_id = state.fgaStoreId
        tenantConfig[configIndex].fga_authz_model_id = state.fgaModelId
        tenantConfig[configIndex].fga_client_id = state.fgaClientId
        tenantConfig[configIndex].fga_client_secret = state.fgaClientSecret
        tenantConfig[configIndex].fga_enabled = 'true'

        fs.writeFileSync(process.env.TENANTS_CONFIG_FILE, JSON.stringify(tenantConfig, null, 2))

        console.log('Model updated and saved in your tenant config file!')
    },

    handle_populate_org_tuples: async (rl, state) => {
        if(state.deployTestOrg == 'y') {
            //At this point our state variables has everything populated, either from existing tenant, or from questionnaire.
            const fgaClient = getSDKConfig(state);

            const sampleOrganization = JSON.parse(fs.readFileSync("./data/sample_organization.json"))
            const orgResult = await fgaClient.writeTuples(sampleOrganization, {authorizationModelId: state.fgaModelId})
            console.log(orgResult)
            console.log("Successfully created organization!")
        }
        else {
            console.log("User elected to skip test org creation.")
        }
    },

    handle_populate_patients: async (rl, state) => {
        if(state.populateOrgWithFHIRPatients == 'y') {
            const fgaClient =getSDKConfig(state);

            var patientSearchUrl = `${state.backendFhirUrl}/Patient?_count=40`
            var pageCount = 0
            console.log("Getting patients from the backend FHIR database...")

            while(patientSearchUrl && pageCount < MAX_PAGE_COUNT) {
                pageCount++
                console.log(`Getting page ${pageCount} from the FHIR server...`)
                var request = {
                    'url': patientSearchUrl,
                    'method': 'GET',
                    'maxRedirects': 0,
                }
                var fhirResult = await axios.request(request)

                if(fhirResult.data.entry) {
                    const sampleOrganization = JSON.parse(fs.readFileSync("./data/sample_organization.json"))
                    const patientIds = fhirResult.data.entry.map(patient => { return {
                        "user": (state.distributePatientsThroughoutOrg == 'n' ? 'Organization:atko_health' : sampleOrganization[Math.floor(Math.random() * sampleOrganization.length)].object),
                        "relation": "assigned_organization",
                        "object": `Patient:${patient.resource.id}`
                    }})

                    const tupleResult = await fgaClient.writeTuples(patientIds, {authorizationModelId: state.fgaModelId})
                    console.log(tupleResult)
                    state.totalPatientsInserted += patientIds.length
                    const nextLink = fhirResult.data.link.filter((link) => link.relation == 'next');
                    if(nextLink.length == 1) {
                        patientSearchUrl = nextLink[0].url
                    }
                    else {
                        patientSearchUrl = null
                    }
                } 
                else {
                    patientSearchUrl = null
                }
            }
        }
        else {
            console.log("User elected to skip patient population.")
        }
    },

    handle_populate_sample_user: async (rl, state) => {
        if(state.createSampleUser == 'y') {
            //At this point our state variables has everything populated, either from existing tenant, or from questionnaire.
            const fgaClient = getSDKConfig(state);

            const sampleUserAssignment = [
                {
                    "user": `user:${state.sampleUser}`,
                    "relation": "member",
                    "object": "group:global_care_team"
                }
            ]
            const orgResult = await fgaClient.writeTuples(sampleUserAssignment, {authorizationModelId: state.fgaModelId})
            console.log(orgResult)
            console.log("Successfully added sample user!")
        }
        else {
            console.log("User elected to skip test user assignment.")
        }
    },
    handle_finished: async (rl, state) => {
        console.log("Congratulations- your secured FHIR proxy is now ready to be secured with FGA.  2 Additional Steps:")
        console.log("1- You'll need to redeploy your secured fhir proxy with `sls deploy`. This is because this script updated your tenants.json file.")
        console.log("2- Even though patients have been created and assigned to the org, no security principals have been configured yet. You'll need to insert tuples for your security principals (users/M2M IDs/etc)")
        console.log("================Deployment Summary===============")
        console.log(`Proxy Tenant ID: ${state.proxyTenant}`)
        if(state.updateModel == 'y' || state.deployNewStore == 'new') {
            console.log(`Step 1- Update model. New Model ID = ${state.fgaModelId}`)
        }
        else {
            console.log(`Step 1- Update model. Skipped...`)
        }

        console.log(`Step 2- Insert new test organizational structure... ${state.deployTestOrg == 'y' ? 'Success': 'Skipped...'}`)

        if(state.populateOrgWithFHIRPatients == 'y') {
            console.log(`Step 3- Populate patients. Success- inserted ${state.totalPatientsInserted} patients.`)
        }
        else {
            console.log(`Step 3- Populate patients. Skipped...`)
        }

        console.log(`Step 4- Populate sample user... ${state.createSampleUser == 'y' ? 'Success': 'Skipped...'}`)
    }
}
function getSDKConfig(state) {
    var fgaClientConfig = {
        apiScheme: state.fgaType == 'cloud' ? 'https' : 'http',
        apiHost: state.fgaEnvironment,
        storeId: state.fgaStoreId
    }

    if(state.fgaType == 'cloud') {
        fgaClientConfig.credentials = {
            method: CredentialsMethod.ClientCredentials,
            config: {
                apiTokenIssuer: state.fgaTokenIssuer,
                apiAudience: state.fgaApiAudience,
                clientId: state.fgaClientId,
                clientSecret: state.fgaClientSecret
            }
        }
    }
    //At this point our state variables has everything populated, either from existing tenant, or from questionnaire.
    return new OpenFgaClient(fgaClientConfig);
}