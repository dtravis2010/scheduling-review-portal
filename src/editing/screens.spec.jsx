// Screen tests: the editing pages with the preview backend (in-memory, no
// Firebase), driven the way a supervisor would use them.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditingProvider } from './EditingContext';
import EditingRoute from './EditingRoute';
import { createPreviewBackend } from './previewBackend';

let backend;
beforeEach(() => {
  localStorage.clear();
  backend = createPreviewBackend();
});

const show = (hash) =>
  render(
    <EditingProvider backend={backend}>
      <EditingRoute hash={hash} />
    </EditingProvider>,
  );

describe('editing screens', () => {
  it('blocks signed-out people and non-supervisors from editing', async () => {
    const { unmount } = show('#edit/ct-mako');
    expect(await screen.findByRole('heading', { name: 'Sign in to edit' })).toBeInTheDocument();
    unmount();
    await backend.signInAs('u-viewer');
    show('#edit/ct-mako');
    expect(await screen.findByText(/not on the supervisor list/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Search words')).toBeNull();
  });

  it('edit → preview → publish with a change note, then shows in history', async () => {
    const user = userEvent.setup();
    await backend.signInAs('u-blake');
    show('#edit/ct-mako');
    const words = await screen.findByLabelText('Search words');
    await user.type(words, '{Control>}{End}{/Control}{Enter}robotic ankle planning');
    await user.click(screen.getByRole('button', { name: 'Preview and publish' }));

    const changes = await screen.findByRole('region', { name: 'What changes when you publish' });
    expect(within(changes).getByText('Changes search results')).toBeInTheDocument();
    expect(within(changes).getByText('Added "robotic ankle planning"')).toBeInTheDocument();
    // Still not live.
    expect((await backend.store.getExam('ct-mako')).aliases).not.toContain('robotic ankle planning');

    await user.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(await screen.findByText(/Add a short note explaining why/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Why are you making this change?'), 'Front desk asked for ankle wording');
    await user.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(await screen.findByRole('heading', { name: 'Published' })).toBeInTheDocument();
    expect((await backend.store.getExam('ct-mako')).aliases).toContain('robotic ankle planning');

    const [latest] = await backend.store.listVersions('ct-mako');
    expect(latest).toMatchObject({ version: 2, changeNote: 'Front desk asked for ankle wording', publishedBy: { name: 'Blake Sup' } });
  });

  it('shows plain-language problems and keeps them from going live', async () => {
    const user = userEvent.setup();
    await backend.signInAs('u-avery');
    show('#edit/ct-mako');
    const words = await screen.findByLabelText('Search words');
    await user.type(words, '{Control>}{End}{/Control}{Enter}ct leg');
    await user.click(screen.getByRole('button', { name: 'Preview and publish' }));
    const alert = await screen.findByText('Fix these before publishing:');
    expect(alert.closest('[role="alert"]')).toHaveTextContent('"ct leg" is already a search word for "CT Lower Extremity"');
  });

  it('flags a conflict and lets a supervisor mark it as intended', async () => {
    const user = userEvent.setup();
    await backend.signInAs('u-avery');
    const svcBackend = backend;
    const { createEditingService } = await import('./editingService');
    const svc = createEditingService(svcBackend.store);
    const me = svcBackend.currentUser();
    await svc.startDraft(me, 'ct-mako');
    const mako = await svcBackend.store.getExam('ct-mako');
    await svc.saveDraft(me, 'ct-mako', {
      facilities: mako.facilities.map((f) => (f.facilityId === 'RBO' ? { ...f, availability: 'yes' } : f)),
    });
    await svc.publish(me, 'ct-mako', 'Riverbend got MAKO software');
    await svc.startDraft(me, 'ct-lower-extremity');
    const parent = await svcBackend.store.getExam('ct-lower-extremity');
    await svc.saveDraft(me, 'ct-lower-extremity', {
      facilities: parent.facilities.map((f) => (f.facilityId === 'RBO' ? { ...f, availability: 'no' } : f)),
    });
    await svc.publish(me, 'ct-lower-extremity', 'Riverbend general CT is down');

    show('#attention');
    expect(await screen.findByText(/marked "Offered" at Riverbend Outpatient Center/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark as intended…' }));
    await user.type(screen.getByLabelText('Why is this correct as it is?'), 'MAKO uses the dedicated scanner');
    await user.click(screen.getByRole('button', { name: 'Mark as intended' }));
    expect(await screen.findByText('Nothing needs attention right now.')).toBeInTheDocument();
  });

  it('lets only list managers add supervisors', async () => {
    const user = userEvent.setup();
    await backend.signInAs('u-blake');
    const { unmount } = show('#supervisors');
    expect(await screen.findByText(/Only supervisors who manage the list/)).toBeInTheDocument();
    unmount();
    await backend.signInAs('u-avery');
    show('#supervisors');
    await user.type(await screen.findByLabelText('Name'), 'Casey Viewer');
    await user.type(screen.getByLabelText('Work email'), 'casey.viewer@example.org');
    await user.click(screen.getByRole('button', { name: 'Add supervisor' }));
    expect(await screen.findByText('Casey Viewer can now edit.')).toBeInTheDocument();
  });
});
