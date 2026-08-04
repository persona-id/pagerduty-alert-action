const core = require('@actions/core');
const { context } = require('@actions/github');
const axios = require('axios');

// Trigger the PagerDuty webhook with a given alert
async function sendAlert(alert) {
  core.info('Sending API call');

  const headers = {
    'Content-Type': 'application/json',
  };

  // Accept every status instead of letting axios reject on non-2xx. An axios
  // error carries the full request config, and config.data is the request body,
  // which contains the routing key — so a rejection here risks printing the key.
  const response = await axios.post('https://events.pagerduty.com/v2/enqueue', alert, {
    headers: headers,
    validateStatus: () => true,
  });

  if (response.status === 202) {
    core.info(`Successfully sent PagerDuty alert. Response: ${JSON.stringify(response.data)}`);
  } else {
    core.setFailed(
      `PagerDuty API returned status code ${response.status} - ${JSON.stringify(response.data)}`
    );
  }
}

// Run the action
(async () => {
  try {
    const integrationKey = core.getInput('pagerduty-integration-key');
    core.info('Reading pagerduty-integration-key');

    // Mask the key from the moment it enters the process, so the runner redacts
    // it from all log output even if some later code path prints the body.
    core.setSecret(integrationKey);
    // Not sure why we see an extra `$` sign at the front of the key, but
    // skipping the first char here to make a correct API call.
    const routingKey = integrationKey.substring(1);
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
  } catch (error) {
    // Report only the message. Never surface the error object: for a request
    // failure it carries the request config, whose data field is the body.
    core.setFailed(`PagerDuty alert failed: ${error.message}`);
  }
})();
