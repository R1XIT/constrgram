import { traverse } from './traverse.js';
import { generatePolling } from './polling.js';
import { generateWebhook } from './webhook.js';

export function generate(project) {
  const { messages, authPrompts, setters, inputs, conditions, transitions, initialNext } = traverse(project);
  const args = {
    token: project.token ?? '',
    messages,
    authPrompts,
    setters,
    inputs,
    conditions,
    transitions,
    initialNext,
  };
  if (project.mode === 'webhook') return generateWebhook(args);
  return generatePolling(args);
}
