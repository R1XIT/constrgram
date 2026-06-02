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
