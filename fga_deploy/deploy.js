//This script is intended to be a guided process for deploying an FGA environment within this project.

const readline = require('readline');
const fgaDeployHandlers = require(`./deploy_handlers`).handlers
const utils = require('./deploy_utils')

const STATE_QUESTIONNAIRE = 'deploy_questionnaire'
const STATE_VALIDATE_TENANT_CONFIG = 'validate_tenant_config'
const STATE_POPULATE_MODEL = 'populate_model'
const STATE_POPULATE_ORG_TUPLES = 'populate_org_tuples'
const STATE_POPULATE_PATIENTS = 'populate_patients'
const STATE_POPULATE_SAMPLE_USER = 'populate_sample_user'
const STATE_FINISHED = 'finished'

const states = [
    STATE_QUESTIONNAIRE,
    STATE_VALIDATE_TENANT_CONFIG,
    STATE_POPULATE_MODEL,
    STATE_POPULATE_ORG_TUPLES,
    STATE_POPULATE_PATIENTS,
    STATE_POPULATE_SAMPLE_USER,
    STATE_FINISHED
]
const initialState = STATE_QUESTIONNAIRE
const finalState = STATE_FINISHED

var state = {
    "currentStep": initialState,
    "proxyTenant": "",
    "fgaType": "",
    "fgaEnvironment": "",
    "fgaStoreId": "",
    "fgaModelId": "",
    "fgaTokenIssuer": "",
    "fgaApiAudience": "",
    "fgaClientId": "",
    "fgaClientSecret": "",
    "deployTestOrg": "",
    "createSampleUser": "",
    "sampleUser": "",
    "populateOrgWithFHIRPatients": "",
    "distributePatientsThroughoutOrg": "",
    "backendFhirUrl": "",
    "totalPatientsInserted": 0
}

main()

async function main() {
    const rl = readline.createInterface(process.stdin, process.stdout);

    const handlers = {
        ...fgaDeployHandlers
    }

    console.log('Starting deployment tasks...')
    console.log('Current task: ' + state.currentStep)
    while(state.currentStep != finalState) {
        console.log('Processing deployment task: ' + state.currentStep)
        await handlers[`handle_${state.currentStep}`](rl, state)

        console.log('Deployment task complete.')
        state.currentStep = states[states.indexOf(state.currentStep) + 1]

        const continueNext = await utils.askSpecific(rl, `Would you like to continue on to the next step (${state.currentStep}) (y/n)?`, ['y','n'])
        if(continueNext == 'n') {
            break
        }
    }
    if(state.currentStep == finalState) {
        await handlers['handle_finished'](rl, state)
    }
    rl.close()
    return
}