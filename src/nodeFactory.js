let counter = 1;

export function nextNodeId(prefix) {
  return `${prefix}_${counter++}`;
}

export function resetNodeIdCounter() {
  counter = 1;
}

export function makeStartNode() {
  return {
    id: 'start',
    type: 'start',
    position: { x: 80, y: 200 },
    data: {},
    deletable: false,
  };
}

export function makeMessageNode(position) {
  return {
    id: nextNodeId('msg'),
    type: 'message',
    position,
    data: {
      text: '',
      buttonsEnabled: false,
      buttons: [],
    },
  };
}

export function makeAuthNode(position) {
  return {
    id: nextNodeId('auth'),
    type: 'auth',
    position,
    data: {
      promptText: '',
      contactButtonText: 'Поделиться контактом',
      refusalEnabled: false,
      refusalButtonText: 'Отказаться',
    },
  };
}

export function makeSetNode(position) {
  return {
    id: nextNodeId('set'),
    type: 'setvar',
    position,
    data: { variable: '', value: '' },
  };
}

export function makeInputNode(position) {
  return {
    id: nextNodeId('input'),
    type: 'input',
    position,
    data: { promptText: '', variable: '' },
  };
}

export function makeConditionNode(position) {
  return {
    id: nextNodeId('cond'),
    type: 'condition',
    position,
    data: { rules: [{ variable: '', op: 'equals', value: '' }] },
  };
}
