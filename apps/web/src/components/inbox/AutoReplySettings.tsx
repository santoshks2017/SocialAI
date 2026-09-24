import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ThemedSelect } from '../ui/ThemedSelect';
import { useToast } from '../ui/Toast';
import { inboxService, type AutoReplyRule, type AutoReplyTemplate, type RuleInput } from '../../services/inbox';

const EMPTY_RULE: RuleInput = {
  platform: 'all', message_type: 'all', condition_type: 'always', condition_value: '',
  action_type: 'ai', ai_tone: 'friendly', template_id: null, is_active: true,
};

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'gmb', label: 'Google Business' },
  { value: 'email', label: 'Email' },
];
const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'comment', label: 'Comments' },
  { value: 'dm', label: 'DMs' },
  { value: 'review', label: 'Reviews' },
  { value: 'email', label: 'Emails' },
];
const CONDITION_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'sentiment_is', label: 'Sentiment is…' },
  { value: 'rating_is', label: 'Rating is…' },
  { value: 'contains_keywords', label: 'Contains keywords…' },
];
const ACTION_OPTIONS = [
  { value: 'ai', label: 'AI reply' },
  { value: 'template', label: 'Saved template' },
  { value: 'manual', label: 'Manual review (no auto-reply)' },
];
const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'apologetic', label: 'Apologetic' },
  { value: 'casual', label: 'Casual' },
];
const CONDITION_HINTS: Record<string, { label: string; placeholder: string }> = {
  sentiment_is: { label: 'Sentiment (positive, neutral or negative)', placeholder: 'negative' },
  rating_is: { label: 'Star ratings, comma separated', placeholder: '1,2' },
  contains_keywords: { label: 'Keywords, comma separated', placeholder: 'price, emi, test drive' },
};
const PLACEHOLDERS = [
  { value: '{{customer_name}}', label: 'Customer' },
  { value: '{{dealer_name}}', label: 'Dealer' },
  { value: '{{phone}}', label: 'Phone' },
  { value: '{{whatsapp}}', label: 'WhatsApp' },
  { value: '{{city}}', label: 'City' },
  { value: '{{email_subject}}', label: 'Email subject' },
];

const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1';
const INPUT = 'w-full h-9 text-sm px-3 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30';
const TEXTAREA = 'w-full text-sm p-3 border border-zinc-200 rounded-lg bg-white resize-none focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30';
const ICON_BUTTON = 'p-1.5 rounded-md text-zinc-400 transition-colors';

const optionLabel = (options: Array<{ value: string; label: string }>, value: string | null) =>
  options.find((o) => o.value === value)?.label ?? value ?? '';

function AutoReplySettings() {
  const { addToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'rules' | 'templates'>('rules');
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [templates, setTemplates] = useState<AutoReplyTemplate[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleInput>(EMPTY_RULE);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Mounted when the modal opens (Modal renders nothing while closed), so this loads on every open.
  useEffect(() => {
    inboxService.getSettings().then((s) => setEnabled(s.autoReplyEnabled)).catch(() => setEnabled(false));
    inboxService.listRules().then((r) => setRules(r.items)).catch(() => {});
    inboxService.listTemplates().then((t) => setTemplates(t.items)).catch(() => {});
  }, []);

  const toggleEnabled = async () => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    try {
      await inboxService.updateSettings(next);
      addToast({
        type: 'success',
        title: next ? 'Auto-reply is on' : 'Auto-reply is off',
        message: next ? 'Matching messages get a reply automatically.' : 'AI drafts wait for your approval in the inbox.',
      });
    } catch {
      setEnabled(!next);
      addToast({ type: 'error', title: 'Could not change auto-reply' });
    }
  };

  const resetRule = () => {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE);
  };

  const saveRule = async (e: FormEvent) => {
    e.preventDefault();
    if (ruleForm.action_type === 'template' && !ruleForm.template_id) {
      addToast({ type: 'error', title: 'Choose a template' });
      return;
    }
    const body: RuleInput = { ...ruleForm, condition_value: ruleForm.condition_type === 'always' ? '' : ruleForm.condition_value.trim() };
    try {
      if (editingRule) await inboxService.updateRule(editingRule, body);
      else await inboxService.createRule(body);
      addToast({ type: 'success', title: editingRule ? 'Rule updated' : 'Rule added' });
      resetRule();
      setRules((await inboxService.listRules()).items);
    } catch {
      addToast({ type: 'error', title: 'Could not save the rule' });
    }
  };

  const editRule = (rule: AutoReplyRule) => {
    setEditingRule(rule.id);
    setRuleForm({
      platform: rule.platform, message_type: rule.message_type, condition_type: rule.condition_type,
      condition_value: rule.condition_value ?? '', action_type: rule.action_type, ai_tone: rule.ai_tone,
      template_id: rule.template_id, is_active: rule.is_active,
    });
  };

  const toggleRule = async (rule: AutoReplyRule) => {
    try {
      await inboxService.updateRule(rule.id, { is_active: !rule.is_active });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: !rule.is_active } : r)));
    } catch {
      addToast({ type: 'error', title: 'Could not update the rule' });
    }
  };

  const deleteRule = async (rule: AutoReplyRule) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await inboxService.deleteRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch {
      addToast({ type: 'error', title: 'Could not delete the rule' });
    }
  };

  const resetTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', text: '' });
  };

  const saveTemplate = async (e: FormEvent) => {
    e.preventDefault();
    const data = { name: templateForm.name.trim(), text: templateForm.text.trim() };
    if (!data.name || !data.text) return;
    try {
      if (editingTemplate) await inboxService.updateTemplate(editingTemplate, data);
      else await inboxService.createTemplate(data);
      addToast({ type: 'success', title: editingTemplate ? 'Template updated' : 'Template added' });
      resetTemplate();
      setTemplates((await inboxService.listTemplates()).items);
    } catch {
      addToast({ type: 'error', title: 'Could not save the template' });
    }
  };

  const deleteTemplate = async (template: AutoReplyTemplate) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await inboxService.deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    } catch {
      addToast({ type: 'error', title: 'Could not delete the template' });
    }
  };

  // Inserts a placeholder at the cursor and puts the caret after it.
  const insertPlaceholder = (placeholder: string) => {
    const area = textRef.current;
    const start = area?.selectionStart ?? templateForm.text.length;
    const end = area?.selectionEnd ?? start;
    setTemplateForm((f) => ({ ...f, text: f.text.slice(0, start) + placeholder + f.text.slice(end) }));
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  };

  const hint = CONDITION_HINTS[ruleForm.condition_type];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Send replies automatically</p>
          <p className="text-xs text-zinc-500 mt-0.5">When off, AI drafts wait for your approval in the inbox.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!enabled}
          aria-label="Send replies automatically"
          disabled={enabled === null}
          onClick={() => void toggleEnabled()}
          className={cn('relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50', enabled ? 'bg-emerald-500' : 'bg-zinc-300')}
        >
          <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', enabled ? 'translate-x-5' : 'translate-x-0.5')} />
        </button>
      </div>

      <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1" role="tablist" aria-label="Auto-reply settings">
        {(['rules', 'templates'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', tab === id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
          >
            {id === 'rules' ? 'Rules' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'rules' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <form onSubmit={(e) => void saveRule(e)} className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-900">{editingRule ? 'Edit rule' : 'New rule'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={LABEL}>Platform</span>
                <ThemedSelect value={ruleForm.platform} onChange={(v) => setRuleForm((f) => ({ ...f, platform: v }))} options={PLATFORM_OPTIONS} ariaLabel="Platform" />
              </div>
              <div>
                <span className={LABEL}>Message type</span>
                <ThemedSelect value={ruleForm.message_type} onChange={(v) => setRuleForm((f) => ({ ...f, message_type: v }))} options={TYPE_OPTIONS} ariaLabel="Message type" />
              </div>
            </div>
            <div>
              <span className={LABEL}>When</span>
              <ThemedSelect value={ruleForm.condition_type} onChange={(v) => setRuleForm((f) => ({ ...f, condition_type: v }))} options={CONDITION_OPTIONS} ariaLabel="When" />
            </div>
            {hint && (
              <label className="block">
                <span className={LABEL}>{hint.label}</span>
                <input
                  required
                  value={ruleForm.condition_value}
                  placeholder={hint.placeholder}
                  onChange={(e) => setRuleForm((f) => ({ ...f, condition_value: e.target.value }))}
                  className={INPUT}
                />
              </label>
            )}
            <div>
              <span className={LABEL}>Reply with</span>
              <ThemedSelect value={ruleForm.action_type} onChange={(v) => setRuleForm((f) => ({ ...f, action_type: v }))} options={ACTION_OPTIONS} ariaLabel="Reply with" />
            </div>
            {ruleForm.action_type === 'ai' && (
              <div>
                <span className={LABEL}>AI tone</span>
                <ThemedSelect value={ruleForm.ai_tone ?? 'friendly'} onChange={(v) => setRuleForm((f) => ({ ...f, ai_tone: v }))} options={TONE_OPTIONS} ariaLabel="AI tone" />
              </div>
            )}
            {ruleForm.action_type === 'template' && (
              <div>
                <span className={LABEL}>Template</span>
                <ThemedSelect
                  value={ruleForm.template_id ?? ''}
                  onChange={(v) => setRuleForm((f) => ({ ...f, template_id: v }))}
                  options={templates.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Choose a template"
                  ariaLabel="Template"
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">{editingRule ? 'Save rule' : 'Add rule'}</Button>
              {editingRule && <Button type="button" variant="secondary" onClick={resetRule}>Cancel</Button>}
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">
              Rules <span className="text-xs font-normal text-zinc-400">· the first match decides</span>
            </p>
            {rules.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center rounded-xl border border-dashed border-zinc-200">No rules yet. New messages get an AI reply by default.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {rules.map((rule) => (
                  <div key={rule.id} className={cn('rounded-xl border border-zinc-200 p-3 flex items-start justify-between gap-3', !rule.is_active && 'opacity-60')}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-800">
                        {optionLabel(PLATFORM_OPTIONS, rule.platform)} · {optionLabel(TYPE_OPTIONS, rule.message_type)}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {optionLabel(CONDITION_OPTIONS, rule.condition_type)}
                        {rule.condition_value ? ` “${rule.condition_value}”` : ''}
                        {' → '}
                        {rule.action_type === 'template'
                          ? `Template: ${rule.template?.name ?? 'deleted'}`
                          : rule.action_type === 'ai' ? `AI reply (${rule.ai_tone ?? 'friendly'})` : 'Manual review'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void toggleRule(rule)}
                        className={cn('text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors', rule.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200')}
                      >
                        {rule.is_active ? 'Active' : 'Paused'}
                      </button>
                      <button type="button" aria-label="Edit rule" onClick={() => editRule(rule)} className={cn(ICON_BUTTON, 'hover:text-zinc-700 hover:bg-zinc-100')}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" aria-label="Delete rule" onClick={() => void deleteRule(rule)} className={cn(ICON_BUTTON, 'hover:text-red-600 hover:bg-red-50')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5 items-start">
          <form onSubmit={(e) => void saveTemplate(e)} className="space-y-3 rounded-xl border border-zinc-200 p-4">
            <p className="text-sm font-semibold text-zinc-900">{editingTemplate ? 'Edit template' : 'New template'}</p>
            <label className="block">
              <span className={LABEL}>Name</span>
              <input
                required
                value={templateForm.name}
                placeholder="e.g. Price enquiry"
                onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Reply</span>
              <textarea
                ref={textRef}
                required
                rows={6}
                value={templateForm.text}
                placeholder="Hi {{customer_name}}, thanks for writing to {{dealer_name}}…"
                onChange={(e) => setTemplateForm((f) => ({ ...f, text: e.target.value }))}
                className={TEXTAREA}
              />
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-400 mr-1">Insert</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => insertPlaceholder(p.value)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-300 hover:bg-orange-50 transition-colors"
                >
                  + {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="flex-1">{editingTemplate ? 'Save template' : 'Add template'}</Button>
              {editingTemplate && <Button type="button" variant="secondary" onClick={resetTemplate}>Cancel</Button>}
            </div>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Templates</p>
            {templates.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center rounded-xl border border-dashed border-zinc-200">No templates yet. Add one to reply the same way every time.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {templates.map((t) => (
                  <div key={t.id} className="rounded-xl border border-zinc-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Edit template"
                          onClick={() => { setEditingTemplate(t.id); setTemplateForm({ name: t.name, text: t.text }); }}
                          className={cn(ICON_BUTTON, 'hover:text-zinc-700 hover:bg-zinc-100')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" aria-label="Delete template" onClick={() => void deleteTemplate(t)} className={cn(ICON_BUTTON, 'hover:text-red-600 hover:bg-red-50')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1.5 whitespace-pre-wrap leading-relaxed">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Our extra (not in the reference): the auto-reply toggle, rules and templates from the old Inbox page.
export function AutoReplyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={open} onClose={onClose} size="full" title="Auto-reply" description="Rules and saved replies for new messages.">
      <AutoReplySettings />
    </Modal>
  );
}
