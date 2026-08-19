export function bindGuestbookEditing() {
  document.querySelectorAll('[data-guestbook-edit]').forEach(form => {
    const fields = new Map(
      Array.from(form.querySelectorAll('[data-guestbook-field]')).map(field => [
        field.dataset.guestbookField,
        field
      ])
    );
    const hiddenFields = new Map(
      Array.from(form.querySelectorAll('[data-guestbook-hidden]')).map(
        field => [field.dataset.guestbookHidden, field]
      )
    );
    const status = form.querySelector('[data-guestbook-status]');
    let saveTimer;
    let editVersion = 0;

    const readField = field =>
      'value' in field ? field.value : field.textContent || '';
    const writeField = (field, value) => {
      if ('value' in field) field.value = value;
      else field.textContent = value;
    };
    const resizeMessageField = field => {
      if (!(field instanceof HTMLTextAreaElement)) return;
      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
    };
    const syncHiddenFields = () => {
      fields.forEach((field, name) => {
        const hiddenField = hiddenFields.get(name);
        if (hiddenField) hiddenField.value = readField(field);
      });
    };
    const scheduleSave = () => {
      const version = ++editVersion;
      window.clearTimeout(saveTimer);
      if (status) status.textContent = '';
      saveTimer = window.setTimeout(async () => {
        const usernameField = fields.get('username');
        if (usernameField) {
          const normalizedUsername = readField(usernameField)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 64);
          if (readField(usernameField) !== normalizedUsername) {
            writeField(usernameField, normalizedUsername);
          }
        }
        syncHiddenFields();
        const body = new URLSearchParams();
        form.querySelectorAll('input[name]').forEach(input => {
          body.set(input.name, input.value);
        });
        try {
          const response = await fetch(form.action, {
            method: 'POST',
            body,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          });
          if (!response.ok) throw new Error('Guestbook update failed.');
        } catch {
          if (version === editVersion && status) {
            status.textContent = 'Could not save. Try again.';
          }
        }
      }, 500);
    };

    fields.forEach(field => {
      field.addEventListener('input', () => {
        resizeMessageField(field);
        scheduleSave();
      });
    });
    fields.forEach(resizeMessageField);
  });
}

export function bindSingleLineGuestbookFields() {
  document.querySelectorAll('[data-guestbook-single-line]').forEach(field => {
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
      }
    });
  });
}
