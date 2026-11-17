
const $ = id => document.getElementById(id);

const cfg = window.PLANER_CONFIG || {};
const LOCAL_KEY = 'planer.tasks.v1';

let supabase = null;
let currentUser = null;
let tasks = [];
let editingId = null;

const today = (() => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
})();

$('taskDate').value = today;

function message(t) {
  $('authMessage').textContent = t;
}

function setStatus(t) {
  $('connection').textContent = t;
}

function localTasks() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(tasks));
}

function toDb(t) {
  return {
    id: t.id,
    user_id: currentUser.id,
    title: t.title,
    description: t.note || t.description || null,
    task_date: t.date || t.task_date || today,
    task_time: t.time || t.task_time || null,
    category: t.category || 'Личное',
    priority: t.priority || 'Средний',
    is_completed: !!(t.done ?? t.is_completed),
    updated_at: new Date().toISOString()
  };
}

function fromDb(t) {
  return {
    id: t.id,
    title: t.title,
    note: t.description || '',
    date: t.task_date,
    time: t.task_time || '',
    category: t.category || 'Личное',
    priority: t.priority || 'Средний',
    done: t.is_completed,
    createdAt: t.created_at
  };
}

async function migrateLocal() {
  const pending = localTasks();

  if (!pending.length) return;

  const { data: existing, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', currentUser.id)
    .limit(1);

  if (error) throw error;

  if (existing && existing.length) {
    message('В облаке уже есть задачи. Локальные задачи оставлены на этом устройстве, автоматический перенос пропущен во избежание дублей.');
    return;
  }

  const rows = pending.map(t => {
    if (!t.id) t.id = crypto.randomUUID();
    return toDb(t);
  });

  const { error: upErr } = await supabase
    .from('tasks')
    .upsert(rows, { onConflict: 'id' });

  if (upErr) throw upErr;

  localStorage.removeItem(LOCAL_KEY);
  message('Локальные задачи перенесены в облако.');
}

async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('task_date')
    .order('task_time');

  if (error) throw error;

  tasks = (data || []).map(fromDb);
  saveLocal();
  render();
}

async function refresh() {
  await migrateLocal();
  await loadTasks();
}

function render() {
  const date = $('taskDate').value;

  const list = tasks
    .filter(t => t.date === date)
    .sort((a, b) => Number(a.done) - Number(b.done));

  const root = $('tasks');
  root.innerHTML = '';

  if (!list.length) {
    root.innerHTML = '<p class="muted">На эту дату задач пока нет.</p>';
    return;
  }

  list.forEach(t => {
    const row = document.createElement('div');
    row.className = 'task' + (t.done ? ' done' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = t.done;

    check.addEventListener('change', async () => {
      t.done = check.checked;
      await updateTask(t);
    });

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = t.title;

    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = [
      t.time,
      t.category,
      t.priority,
      t.note
    ].filter(Boolean).join(' · ');

    const del = document.createElement('button');
    del.className = 'delete';
    del.textContent = 'Удалить';

    del.addEventListener('click', async () => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', t.id)
        .eq('user_id', currentUser.id);

      if (error) {
        alert('Не удалось удалить задачу: ' + error.message);
        return;
      }

      tasks = tasks.filter(x => x.id !== t.id);
      saveLocal();
      render();
    });

    row.append(check, title, meta, del);
    root.append(row);
  });
}

async function updateTask(t) {
  const { error } = await supabase
    .from('tasks')
    .update(toDb(t))
    .eq('id', t.id)
    .eq('user_id', currentUser.id);

  if (error) {
    alert('Не удалось сохранить: ' + error.message);
    await loadTasks();
    return;
  }

  saveLocal();
  render();
}

function showApp(user) {
  currentUser = user;

  $('auth').hidden = !!user;
  $('app').hidden = !user;

  setStatus(
    user ? 'Подключено: ' + user.email : 'Не подключено'
  );
}

async function signIn() {
  try {
    if (!supabase) throw new Error('Нет подключения к Supabase.');

    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      message('Введите электронную почту и пароль.');
      return;
    }

    message('Выполняется вход…');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    showApp(data.user);
    await refresh();

  } catch (e) {
    message(e.message);
  }
}

async function signUp() {
  try {
    if (!supabase) throw new Error('Нет подключения к Supabase.');

    const email = $('email').value.trim();
    const password = $('password').value;

    if (!email || !password) {
      message('Введите электронную почту и пароль.');
      return;
    }

    if (password.length < 8) {
      message('Пароль должен содержать не менее 8 символов.');
      return;
    }

    message('Создаём аккаунт…');

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      showApp(data.user);
      await refresh();
    } else {
      message('Аккаунт создан. Проверьте почту для подтверждения регистрации. Если письмо не приходит, проверьте настройки подтверждения email в Supabase.');
    }

  } catch (e) {
    message(e.message);
  }
}

$('signIn').onclick = signIn;
$('signUp').onclick = signUp;

$('signOut').onclick = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    message(error.message);
    return;
  }

  tasks = [];
  showApp(null);
};

$('addTask').onclick = () => {
  $('entry').hidden = false;
  $('taskTitle').value = '';
  $('taskNote').value = '';
  $('taskTime').value = '';
  $('taskCategory').value = 'Личное';
  $('taskPriority').value = 'Средний';
};

$('cancelTask').onclick = () => {
  $('entry').hidden = true;
};

$('saveTask').onclick = async () => {
  const title = $('taskTitle').value.trim();

  if (!title) {
    alert('Введите название задачи');
    return;
  }

  const t = {
    id: crypto.randomUUID(),
    title,
    note: $('taskNote').value.trim(),
    date: $('taskDate').value,
    time: $('taskTime').value,
    category: $('taskCategory').value,
    priority: $('taskPriority').value,
    done: false
  };

  const { error } = await supabase
    .from('tasks')
    .insert(toDb(t));

  if (error) {
    alert('Не удалось сохранить: ' + error.message);
    return;
  }

  tasks.push(t);
  saveLocal();
  render();
  $('entry').hidden = true;
};

$('taskDate').onchange = render;

if (
  !cfg.supabaseUrl ||
  !cfg.supabasePublishableKey ||
  !window.supabase
) {
  setStatus('Не настроено подключение');
  message('Проверьте config.js и подключение к интернету.');
} else {
  supabase = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey
  );

  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) {
      message(error.message);
      return;
    }

    if (data.session) {
      showApp(data.session.user);

      try {
        await refresh();
      } catch (e) {
        message(e.message);
      }
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    showApp(session ? session.user : null);

    if (session) {
      Promise.resolve().then(async () => {
        try {
          await refresh();
        } catch (e) {
          message(e.message);
        }
      });
    } else {
      tasks = [];
      $('tasks').innerHTML = '';
    }
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch(() => {});
  });
}
