export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped';
export type StepKind = 'inspect' | 'query' | 'write' | 'verify' | 'respond';
export interface PlanStep {
  id: string; description: string; kind: StepKind; dependsOn: string[];
  status: StepStatus; resolvedBy?: string; startedAt?: number; finishedAt?: number; outcome?: string;
}
export interface ExecutionRecord {
  id: string; stepId: string; name: string; status: 'running' | 'completed' | 'failed';
  startedAt: number; finishedAt?: number; error?: string; subject?: string; expectedFailure?: boolean;
}
export interface QueryEvidence {
  actionId?: string; stepId?: string; tool: string; datasource: string; expression: string; range: Record<string, unknown>;
  status: 'success' | 'error'; data: 'present' | 'empty' | 'unknown'; at: number;
}
export interface DashboardEvidence {
  uid: string; status: 'verified' | 'unverified'; detail: string; at: number;
}
export interface TaskPlan {
  blockedReason?: string;
  revision: number; summary: string; steps: PlanStep[]; actions: ExecutionRecord[];
  queries: QueryEvidence[]; dashboards: DashboardEvidence[];
}
const kinds: StepKind[] = ['inspect', 'query', 'write', 'verify', 'respond'];
export function validateSteps(value: unknown): PlanStep[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Plan requires at least one step.');
  const steps = value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim() ||
      typeof raw.description !== 'string' || !raw.description.trim() || !kinds.includes(raw.kind) ||
      !Array.isArray(raw.dependsOn) || !raw.dependsOn.every((id: unknown) => typeof id === 'string')) {
      throw new Error('Each step requires id, description, kind, and dependsOn.');
    }
    return { id: raw.id as string, description: raw.description as string, kind: raw.kind as StepKind,
      dependsOn: raw.dependsOn as string[], status: 'pending' as const };
  });
  const byId = new Map(steps.map(s => [s.id, s]));
  if (byId.size !== steps.length) throw new Error('Step IDs must be unique.');
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('Plan dependencies contain a cycle.');
    if (visited.has(id)) return;
    const step = byId.get(id);
    if (!step) throw new Error(`Unknown dependency: ${id}`);
    visiting.add(id); step.dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  };
  steps.forEach(s => visit(s.id));
  return steps;
}

export class PlanExecution {
  state: TaskPlan = { revision: 0, summary: 'Work on your request', steps: [{ id: 'request', description: 'Answer the request using available evidence', kind: 'respond', dependsOn: [], status: 'running', startedAt: Date.now() }], actions: [], queries: [], dashboards: [] };
  constructor(private publish: (plan: TaskPlan) => void) { this.emit(); }
  emit() { this.publish(JSON.parse(JSON.stringify(this.state))); }
  revise(summary: unknown, value: unknown) {
    if (typeof summary !== 'string' || !summary.trim()) throw new Error('A short plan summary is required.');
    const steps = validateSteps(value);
    for (const old of this.state.steps) {
      if (!this.state.actions.some(a => a.stepId === old.id)) continue;
      const next = steps.find(s => s.id === old.id);
      if (!next || next.description !== old.description || next.kind !== old.kind || JSON.stringify(next.dependsOn) !== JSON.stringify(old.dependsOn)) {
        throw new Error('Keep executed steps unchanged; add new steps for revised work.');
      }
      Object.assign(next, old);
    }
    this.state = { ...this.state, summary, steps, revision: this.state.revision + 1 }; this.emit();
  }
  current() { return this.state.steps.find(s => s.status === 'running'); }
  start(id: string) {
    const step = this.state.steps.find(s => s.id === id);
    if (!step) throw new Error('Unknown step.');
    if (this.current() && this.current()?.id !== id) throw new Error('Finish the current step before starting another.');
    if (!['pending', 'failed', 'running'].includes(step.status)) throw new Error('This step cannot be started.');
    if (!step.dependsOn.every(dep => this.state.steps.find(s => s.id === dep)?.status === 'completed')) throw new Error('Prerequisites must complete successfully first.');
    step.status = 'running'; step.startedAt = Date.now(); step.finishedAt = undefined; step.outcome = undefined; this.emit();
  }
  finish(id: string, outcome: string, expectedFailureActionIds: unknown = []) {
    const step = this.current();
    if (!step || step.id !== id) throw new Error('Start this step first.');
    const actions = this.state.actions.filter(a => a.stepId === id);
    if (!Array.isArray(expectedFailureActionIds) || !expectedFailureActionIds.every(id => typeof id === 'string')) throw new Error('expectedFailureActionIds must be an array of action IDs.');
    const expected = new Set<string>(expectedFailureActionIds);
    for (const actionId of expected) {
      const action = actions.find(a => a.id === actionId);
      if (!action || action.status !== 'failed' || !/query/i.test(action.name) || /write|update|save|create|delete|patch|execute/i.test(action.name) ||
        !this.state.queries.some(q => q.actionId === actionId && q.stepId === id && q.status === 'error')) {
        throw new Error('Only recorded failed diagnostic queries in this step can be acknowledged as expected failures.');
      }
    }
    if (actions.some(a => a.status === 'running' || (a.status === 'failed' && !expected.has(a.id)))) throw new Error('Failed or running actions cannot be marked complete. For intentional diagnostic query errors, pass their action IDs in expectedFailureActionIds; otherwise repair the failure.');
    if (step.kind !== 'respond' && !actions.length) throw new Error('This step has no execution evidence.');
    if (step.kind === 'query' && !this.state.queries.some(q => q.stepId === id && q.status === 'success')) throw new Error('No successful query execution is recorded for this step.');
    if (step.kind === 'verify' && this.state.dashboards.some(d => d.status !== 'verified')) throw new Error('Dashboard verification is incomplete.');
    if (step.kind === 'write' && this.state.dashboards.some(d => d.status === 'verified')) {
      for (const failed of this.state.steps.filter(s => s.status === 'failed' && s.kind === 'write' && !s.resolvedBy)) {
        const failures = this.state.actions.filter(a => a.stepId === failed.id && a.status === 'failed');
        if (failures.length && failures.every(a => a.subject && actions.some(repair => repair.name === a.name && repair.subject === a.subject && repair.status === 'completed'))) {
          failed.resolvedBy = step.id;
        }
      }
    }
    if (step.kind === 'verify') {
      for (const failed of this.state.steps.filter(s => s.status === 'failed' && s.kind === 'verify' && !s.resolvedBy)) {
        const prior = this.state.actions.filter(a => a.stepId === failed.id);
        if (prior.length && prior.every(a => a.subject?.startsWith('dashboard-uid:') &&
          this.state.dashboards.some(d => d.uid === a.subject!.slice('dashboard-uid:'.length) && d.status === 'verified') &&
          actions.some(repair => repair.name === a.name && repair.subject === a.subject && repair.status === 'completed'))) failed.resolvedBy = step.id;
      }
    }
    for (const action of actions) if (expected.has(action.id)) action.expectedFailure = true;
    step.status = 'completed'; step.finishedAt = Date.now(); step.outcome = outcome; this.emit();
  }
  beginAction(id: string, name: string) {
    let step = this.current();
    if (!step) {
      const next = this.state.steps.find(s => s.status === 'pending' && s.dependsOn.every(dep => this.state.steps.find(d => d.id === dep)?.status === 'completed'));
      if (!next) throw new Error('No ready task step. Revise the plan or start a ready step.');
      this.start(next.id); step = next;
    }
    this.state.actions.push({ id, name, stepId: step.id, status: 'running', startedAt: Date.now() }); this.emit();
  }
  endAction(id: string, error?: string) {
    const action = this.state.actions.find(a => a.id === id)!;
    action.status = error ? 'failed' : 'completed'; action.error = error; action.finishedAt = Date.now(); this.emit();
  }
  fail(id: string, reason: string) {
    const step = this.state.steps.find(s => s.id === id);
    if (!step || step.status === 'completed') throw new Error('Cannot fail an unknown or completed step.');
    step.status = 'failed'; step.outcome = reason; step.finishedAt = Date.now();
    let changed = true;
    while (changed) { changed = false; for (const s of this.state.steps) {
      if (s.status === 'pending' && s.dependsOn.some(dep => ['failed', 'blocked', 'skipped'].includes(this.state.steps.find(d => d.id === dep)!.status))) {
        s.status = 'blocked'; s.outcome = 'A prerequisite failed.'; changed = true;
      }
    } }
    this.emit();
  }
  skip(id: string, reason: string) {
    const step = this.state.steps.find(s => s.id === id);
    if (!step || !['pending', 'running'].includes(step.status) || this.state.actions.some(a => a.stepId === id)) throw new Error('Only unexecuted steps can be skipped.');
    this.fail(id, reason); step.status = 'skipped'; this.emit();
  }
  interrupt(reason: string) {
    for (const a of this.state.actions) if (a.status === 'running') { a.status = 'failed'; a.error = reason; a.finishedAt = Date.now(); }
    const current = this.current(); if (current) this.fail(current.id, reason);
    for (const step of this.state.steps) if (step.status === 'pending') { step.status = 'blocked'; step.outcome = reason; }
    this.emit();
  }
}
