import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { apiConnectionService } from '../../services/apiConnections';
import type { ApiConnectionView, ApiConnectionsList, ModelDefaults, ModelOption, ModelOptions } from '../../services/apiConnections';
import { ApiError } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { formatRelativeTime } from '../../utils/helpers';
import { choiceFromStored, storedFromChoice } from '../../utils/aiModels';

const CARD = 'bg-white rounded-xl border border-zinc-200 shadow-sm';
const CARD_HEADER = 'px-5 py-4 border-b border-zinc-100';
const INPUT = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-600/30 disabled:bg-zinc-50 disabled:text-zinc-500';
const LABEL = 'block text-[13px] font-medium text-zinc-700 mb-1.5';
const DEFAULT_PROVIDER = 'google-gemini';

type Busy = 'save' | 'saveKey' | 'test' | 'removeKey' | 'enabled' | 'delete' | null;

// A model select's value: '' (default), an option id, or 'other' (with the id typed into `custom`).
interface ModelChoiceDraft { select: string; custom: string }
const emptyModelChoice = (): ModelChoiceDraft => ({ select: '', custom: '' });
const emptyModels = () => ({ text: emptyModelChoice(), image: emptyModelChoice(), video: emptyModelChoice(), videoResolution: '', reelEngine: '' });

// id is null while the editor holds a connection that hasn't been saved yet.
interface Draft {
  id: string | null;
  name: string;
  provider: string;
  notes: string;
  models: { text: ModelChoiceDraft; image: ModelChoiceDraft; video: ModelChoiceDraft; videoResolution: string; reelEngine: string };
}

const draftFrom = (c: ApiConnectionView, options: ModelOptions): Draft => ({
  id: c.id,
  name: c.name,
  provider: c.provider,
  notes: c.notes ?? '',
  models: {
    text: choiceFromStored(c.models.text, options.text),
    image: choiceFromStored(c.models.image, options.image),
    video: choiceFromStored(c.models.video, options.video),
    videoResolution: c.models.videoResolution ?? '',
    reelEngine: c.models.reelEngine ?? '',
  },
});
const messageOf = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
const labelFor = (defaultId: string, options: ModelOption[]) => options.find((o) => o.id === defaultId)?.label ?? defaultId;
const resolutionLabel = (value: string) => (value === '4k' ? '4K' : value);

function statusBanner(c: ApiConnectionView, active: ApiConnectionsList['activeKey']): { ok: boolean; text: string } {
  const ok = active.source !== 'none';
  if (c.inUse) return { ok: true, text: "Using the key saved here — for captions, AI images and every reel. Remove it to go back to the server's GEMINI_API_KEY." };
  if (c.hasKey && !c.enabled) return { ok, text: "This connection is turned off, so its saved key isn't used." };
  if (c.hasKey && active.source === 'saved') return { ok, text: "A key is saved here, but another connection's key is in use." };
  if (active.source === 'env') {
    return { ok, text: c.hasKey ? "A key is saved here, but the server's GEMINI_API_KEY is in use right now." : "Using the server's GEMINI_API_KEY. Save a key here to override it." };
  }
  if (active.source === 'saved') return { ok, text: "No key is saved here — another connection's key is in use." };
  return { ok, text: 'No Gemini key is configured — image and reel generation is off until you save one.' };
}

export default function ApiConnectionsPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<ApiConnectionsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState<Busy>(null);

  const load = useCallback(async () => {
    try {
      const next = await apiConnectionService.list();
      setData(next);
      setDraft(next.items[0] ? draftFrom(next.items[0], next.modelOptions) : null);
    } catch (err) {
      addToast({ type: 'error', title: "Couldn't load API connections", message: messageOf(err) });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const reload = async () => {
    const next = await apiConnectionService.list();
    setData(next);
    return next;
  };

  const run = async (kind: Busy, failTitle: string, action: () => Promise<void>) => {
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      addToast({ type: 'error', title: failTitle, message: messageOf(err) });
    } finally {
      setBusy(null);
    }
  };

  const openEditor = (next: Draft | null) => {
    setDraft(next);
    setKeyInput('');
  };

  const selected = draft?.id ? data?.items.find((c) => c.id === draft.id) ?? null : null;
  const isNew = draft !== null && draft.id === null;

  const saveConnection = () => run('save', "Couldn't save the connection", async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!draft.id) {
      const saved = await apiConnectionService.create({ name, provider: draft.provider, notes: draft.notes.trim() || undefined });
      const next = await reload();
      setDraft(draftFrom(saved, next.modelOptions));
      addToast({ type: 'success', title: 'Connection saved' });
      return;
    }
    const textModel = storedFromChoice(draft.models.text.select, draft.models.text.custom);
    const imageModel = storedFromChoice(draft.models.image.select, draft.models.image.custom);
    const videoModel = storedFromChoice(draft.models.video.select, draft.models.video.custom);
    if (textModel === 'invalid' || imageModel === 'invalid' || videoModel === 'invalid') {
      addToast({ type: 'error', title: 'Check the model IDs', message: 'Model IDs look like gemini-3.9-flash.' });
      return;
    }
    const saved = await apiConnectionService.update(draft.id, {
      name,
      notes: draft.notes,
      textModel,
      imageModel,
      videoModel,
      videoResolution: draft.models.videoResolution || null,
      reelEngine: (draft.models.reelEngine || null) as 'ai' | 'quick' | null,
    });
    const next = await reload();
    setDraft(draftFrom(saved, next.modelOptions));
    addToast({ type: 'success', title: 'Connection saved' });
  });

  const saveKey = (id: string) => run('saveKey', "Couldn't save the key", async () => {
    await apiConnectionService.saveKey(id, keyInput.trim());
    setKeyInput('');
    await reload();
    addToast({ type: 'success', title: 'Key saved' });
  });

  const testKey = (id: string) => run('test', 'Key test failed', async () => {
    const result = await apiConnectionService.test(id);
    const message = result.source === 'env' ? `${result.detail} (Tested the server's GEMINI_API_KEY.)` : result.detail;
    addToast(result.ok
      ? { type: 'success', title: 'Key works', message }
      : { type: 'error', title: 'Key test failed', message });
  });

  const removeKey = (id: string) => {
    if (!window.confirm('Remove the saved key? Generation will fall back to the server key.')) return;
    void run('removeKey', "Couldn't remove the key", async () => {
      await apiConnectionService.removeKey(id);
      await reload();
      addToast({ type: 'success', title: 'Key removed' });
    });
  };

  const setEnabled = (id: string, enabled: boolean) => run('enabled', "Couldn't update the connection", async () => {
    await apiConnectionService.update(id, { enabled });
    await reload();
    addToast({ type: 'success', title: enabled ? 'Connection turned on' : 'Connection turned off' });
  });

  const deleteConnection = (c: ApiConnectionView) => {
    if (!window.confirm(`Delete "${c.name}"? Its saved key is deleted too.`)) return;
    void run('delete', "Couldn't delete the connection", async () => {
      await apiConnectionService.remove(c.id);
      const next = await reload();
      openEditor(next.items[0] ? draftFrom(next.items[0], next.modelOptions) : null);
      addToast({ type: 'success', title: 'Connection deleted' });
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm text-zinc-400 font-medium">Loading API connections...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">APIs &amp; models</h1>
        <p className="text-sm text-zinc-500 mt-1">Connect the AI services that generate captions, images and reels.</p>
      </div>

      {!data ? (
        <div className={`${CARD} p-8 text-center space-y-3`}>
          <p className="text-sm text-zinc-500">Couldn't load API connections.</p>
          <Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>Try again</Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start">
          <section className={CARD}>
            <div className={`${CARD_HEADER} flex flex-wrap items-center justify-between gap-3`}>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <h2 className="text-lg font-semibold text-zinc-900">API connections</h2>
                <span className="text-[12px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full">{data.items.length}</span>
              </div>
              <Button variant="secondary" className="whitespace-nowrap" onClick={() => openEditor({ id: null, name: '', provider: data.providers[0]?.id ?? DEFAULT_PROVIDER, notes: '', models: emptyModels() })}>
                <Plus className="w-4 h-4" /> Add API
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-[13px] text-zinc-500">Keys used for captions, AI images and reels. Keys are stored encrypted and never shown again.</p>
              {data.items.map((c) => {
                const isSelected = c.id === draft?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openEditor(draftFrom(c, data.modelOptions))}
                    className={`w-full text-left rounded-xl border p-3.5 transition-colors ${isSelected ? 'border-orange-600 bg-orange-50 ring-1 ring-orange-600/20' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{c.name}</p>
                        <p className="text-[12px] text-zinc-500 truncate">{c.providerLabel}</p>
                      </div>
                      {c.inUse && (
                        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />In use
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <KeyChip hasKey={c.hasKey} />
                      {c.keyLast4 && <span className="text-[12px] font-mono text-zinc-500">•••• {c.keyLast4}</span>}
                      {!c.enabled && <span className="text-[12px] font-medium text-zinc-400">Off</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={CARD}>
            <div className={CARD_HEADER}>
              <h2 className="text-lg font-semibold text-zinc-900">{isNew ? 'New API connection' : 'Edit API connection'}</h2>
            </div>

            {!draft || (!isNew && !selected) ? (
              <div className="p-8 flex flex-col items-center text-center gap-2">
                <KeyRound className="w-6 h-6 text-zinc-400" />
                <p className="text-sm text-zinc-500">Select a connection to edit it, or add a new one.</p>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label htmlFor="api-name" className={LABEL}>Name</label>
                      <input
                        id="api-name"
                        className={INPUT}
                        value={draft.name}
                        maxLength={80}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        placeholder="Gemini (team key)"
                      />
                    </div>
                    <div>
                      <label htmlFor="api-provider" className={LABEL}>Platform</label>
                      <select
                        id="api-provider"
                        className={INPUT}
                        value={draft.provider}
                        disabled={!isNew}
                        onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                      >
                        {data.providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {selected ? (
                    <>
                      <Banner {...statusBanner(selected, data.activeKey)} />

                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor="api-key" className="text-[13px] font-medium text-zinc-700">{selected.hasKey ? 'Replace API key' : 'API key'}</label>
                          <KeyChip hasKey={selected.hasKey} />
                          {selected.keyLast4 && <span className="text-[12px] font-mono text-zinc-500">•••• {selected.keyLast4}</span>}
                          {selected.keyUpdatedAt && <span className="text-[12px] text-zinc-400">Updated {formatRelativeTime(selected.keyUpdatedAt)}</span>}
                        </div>
                        {!data.keyStorageReady && (
                          <div className="flex gap-2 rounded-xl px-4 py-3 text-sm bg-amber-50 text-amber-800">
                            <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>Key storage isn't configured on the server yet, so keys can't be saved.</span>
                          </div>
                        )}
                        <input
                          id="api-key"
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          className={INPUT}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder={selected.hasKey ? '•••••••• (a key is saved)' : 'Paste your Gemini API key'}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => saveKey(selected.id)}
                            isLoading={busy === 'saveKey'}
                            disabled={!keyInput.trim() || !data.keyStorageReady || busy !== null}
                          >
                            Save key
                          </Button>
                          <Button variant="secondary" onClick={() => testKey(selected.id)} isLoading={busy === 'test'} disabled={busy !== null}>
                            Test
                          </Button>
                          {selected.hasKey && (
                            <Button variant="secondary" onClick={() => removeKey(selected.id)} isLoading={busy === 'removeKey'} disabled={busy !== null}>
                              Remove
                            </Button>
                          )}
                        </div>
                        <p className="text-[12px] text-zinc-500">Test is a free read — it checks the key without generating anything.</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-zinc-500 rounded-xl bg-zinc-50 px-4 py-3">Save the connection first, then add its key.</p>
                  )}

                  {selected && (
                    <ModelsSection
                      draft={draft}
                      modelOptions={data.modelOptions}
                      modelDefaults={data.modelDefaults}
                      onChange={(models) => setDraft({ ...draft, models })}
                    />
                  )}

                  <div>
                    <label htmlFor="api-notes" className={LABEL}>Notes</label>
                    <textarea
                      id="api-notes"
                      rows={3}
                      maxLength={1000}
                      className={`${INPUT} resize-y`}
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      placeholder="Billing account, owner, anything worth remembering"
                    />
                  </div>

                  {selected && (
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-orange-600"
                        checked={selected.enabled}
                        disabled={busy !== null}
                        onChange={(e) => setEnabled(selected.id, e.target.checked)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-900">Enabled</span>
                        <span className="block text-[12px] text-zinc-500">When off, this connection's key is never used for generation.</span>
                      </span>
                    </label>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {selected && (
                      <Button variant="ghost" onClick={() => deleteConnection(selected)} isLoading={busy === 'delete'} disabled={busy !== null}>
                        <Trash2 className="w-4 h-4" /> Delete connection
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => openEditor(null)} disabled={busy !== null}>Close</Button>
                    <Button
                      variant="primary"
                      onClick={saveConnection}
                      isLoading={busy === 'save'}
                      disabled={!draft.name.trim() || busy !== null}
                    >
                      Save connection
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function KeyChip({ hasKey }: { hasKey: boolean }) {
  return hasKey
    ? <span className="text-[12px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">key saved</span>
    : <span className="text-[12px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full">no key</span>;
}

function Banner({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`flex gap-2 rounded-xl px-4 py-3 text-sm ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {ok ? <KeyRound className="w-4 h-4 mt-0.5 shrink-0" /> : <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}

function ModelsSection({
  draft, modelOptions, modelDefaults, onChange,
}: {
  draft: Draft;
  modelOptions: ModelOptions;
  modelDefaults: ModelDefaults;
  onChange: (models: Draft['models']) => void;
}) {
  const { models } = draft;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Models</h3>
        <p className="text-[12px] text-zinc-500 mt-0.5">Used for captions, AI images and reels. Leave on default to always get the latest.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ModelSelect
          id="model-text"
          label="Text"
          choice={models.text}
          options={modelOptions.text}
          defaultLabel={labelFor(modelDefaults.text, modelOptions.text)}
          onChange={(text) => onChange({ ...models, text })}
        />
        <ModelSelect
          id="model-image"
          label="Image"
          choice={models.image}
          options={modelOptions.image}
          defaultLabel={labelFor(modelDefaults.image, modelOptions.image)}
          onChange={(image) => onChange({ ...models, image })}
        />
        <ModelSelect
          id="model-video"
          label="Video"
          choice={models.video}
          options={modelOptions.video}
          defaultLabel={labelFor(modelDefaults.video, modelOptions.video)}
          onChange={(video) => onChange({ ...models, video })}
        />
        <div>
          <label htmlFor="model-resolution" className={LABEL}>Reel resolution</label>
          <select
            id="model-resolution"
            className={INPUT}
            value={models.videoResolution}
            onChange={(e) => onChange({ ...models, videoResolution: e.target.value })}
          >
            <option value="">Default — {resolutionLabel(modelDefaults.videoResolution)}</option>
            {modelOptions.videoResolutions.map((r) => <option key={r} value={r}>{resolutionLabel(r)}</option>)}
          </select>
          <p className="text-[12px] text-zinc-500 mt-1">Higher resolution costs more per second of video.</p>
        </div>
        <div>
          <label htmlFor="model-engine" className={LABEL}>Reels use</label>
          <select
            id="model-engine"
            className={INPUT}
            value={models.reelEngine}
            onChange={(e) => onChange({ ...models, reelEngine: e.target.value })}
          >
            <option value="">Default — {modelDefaults.reelEngine === 'quick' ? 'Quick animation' : 'AI video'}</option>
            <option value="ai">AI video (video model)</option>
            <option value="quick">Quick animation (no AI video cost)</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function ModelSelect({
  id, label, choice, options, defaultLabel, onChange,
}: {
  id: string;
  label: string;
  choice: ModelChoiceDraft;
  options: ModelOption[];
  defaultLabel: string;
  onChange: (choice: ModelChoiceDraft) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <select
        id={id}
        className={INPUT}
        value={choice.select}
        onChange={(e) => onChange({ select: e.target.value, custom: choice.custom })}
      >
        <option value="">Default — {defaultLabel}</option>
        {options.map((o, i) => <option key={o.id} value={o.id}>{o.label}{i === 0 ? ' — latest' : ''}</option>)}
        <option value="other">Other model ID…</option>
      </select>
      {choice.select === 'other' && (
        <input
          className={`${INPUT} mt-2`}
          value={choice.custom}
          spellCheck={false}
          placeholder="e.g. gemini-3.9-flash"
          onChange={(e) => onChange({ select: 'other', custom: e.target.value })}
        />
      )}
    </div>
  );
}
