const core = require('@actions/core');
const { context } = require('@actions/github');
const axios = require('axios');

// Trigger the PagerDuty webhook with a given alert
async function sendAlert(alert) {
  core.info('Sending API call');
  
  const headers = {
    'Content-Type': 'application/json',
  };

  let response;
  try {
    response = await axios.post('https://events.pagerduty.com/v2/enqueue', alert, {headers: headers});
  } catch (error) {
    // Report only the status and PagerDuty's own error body. Never surface the
    // error object itself: axios attaches the full request config, and
    // config.data is the request body, which carries the routing key.
    if (error.response) {
      core.setFailed(
        `PagerDuty API returned status code ${error.response.status} - ${JSON.stringify(error.response.data)}`
      );
    } else {
      core.setFailed(`PagerDuty API request failed: ${error.message}`);
    }
    return;
  }

  if (response.status === 202) {
    core.info(`Successfully sent PagerDuty alert. Response: ${JSON.stringify(response.data)}`);
  } else {
    core.error(`PagerDuty API returned status code ${response.status} - ${JSON.stringify(response.data)}`);
    core.setFailed(
      `PagerDuty API returned status code ${response.status} - ${JSON.stringify(response.data)}`
    );
  }
}

// Run the action
(async () => {
  const integrationKey = core.getInput('pagerduty-integration-key');
  core.info('Reading pagerduty-integration-key');

  // Not sure why we see an extra `$` sign at the front of the key, but
  // skipping the first char here to make a correct API call.
  const routingKey = integrationKey.substring(1);
  // Register with the runner so it redacts the key from all log output, in case
  // any future code path ends up printing the request body.
  core.setSecret(routingKey);

  let alert = {
    payload: {
      summary: `${context.repo.repo}: Error in "${context.workflow}" run by @${context.actor}`,
      timestamp: new Date().toISOString(),
      source: 'GitHub Actions',
      severity: 'critical',
      custom_details: {
        run_details: `https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`,
      },
    },
    routing_key: routingKey,
    event_action: 'trigger',
  };
  core.info('Forming default request body');

  const customSummary = core.getInput('incident-summary');
  if (customSummary != '') {
    alert.payload.summary = customSummary;
  }

  const region = core.getInput('incident-region');
  if (region != '') {
    alert.payload.custom_details.region = region;
  }

  const environment = core.getInput('incident-environment');
  if (environment != '') {
    alert.payload.custom_details.environment = environment;
  }

  const dedupKey = core.getInput('pagerduty-dedup-key');
  if (dedupKey != '') {
    alert.dedup_key = dedupKey;
  }
  core.info('Customizing request body');

  await sendAlert(alert);
})();
