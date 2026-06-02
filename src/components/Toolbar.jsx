import { useStore } from '../store.js';
import { generate } from '../generator/index.js';

export default function Toolbar() {
  const token = useStore((s) => s.token);
  const mode = useStore((s) => s.mode);
  const setToken = useStore((s) => s.setToken);
  const setMode = useStore((s) => s.setMode);

  async function onSave() {
    const project = useStore.getState().toProjectJSON();
    await window.api.saveProject(JSON.stringify(project, null, 2));
  }

  async function onOpen() {
    const result = await window.api.openProject();
    if (!result.ok) return;
    const project = JSON.parse(result.data);
    useStore.getState().loadProject(project);
  }

  async function onCompile() {
    const project = useStore.getState().toProjectJSON();
    const code = generate(project);
    await window.api.saveBot(code);
  }

  return (
    <>
      <input
        type="password"
        placeholder="Токен бота"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={{ width: 200 }}
      />
      <select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="polling">Long Polling</option>
        <option value="webhook">Webhook</option>
      </select>
      <div className="spacer" />
      <button onClick={onSave}>Сохранить</button>
      <button onClick={onOpen}>Открыть</button>
      <button onClick={onCompile}>Компилировать</button>
    </>
  );
}
