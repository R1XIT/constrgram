import { traverse } from './traverse.js';
import { generatePolling } from './polling.js';
import { generateWebhook } from './webhook.js';

export function generate(project) {
  const { messages, transitions, initialNext } = traverse(project);
  const args = {
    token: project.token ?? '',
    messages,
    transitions,
    initialNext,
  };
  if (project.mode === 'webhook') return generateWebhook(args);
  return generatePolling(args);
}
