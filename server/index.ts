// Файл сервера: Hono + Bun. Обслуживает статику и API, интеграция с Supabase.
// Импорт Hono — фреймворк для роутинга HTTP.
import { Hono } from 'hono'
// Импорт serve из Bun — запуск HTTP‑сервера.
import { serve } from 'bun'
// Импорт мидлвара CORS для Hono.
import { cors } from 'hono/cors'
// Импорт логгера запросов для Hono.
import { logger } from 'hono/logger'
// Импорт serveStatic для раздачи статики через Bun.
import { serveStatic } from 'hono/bun'
// Импорт клиента Supabase для работы с БД и аутентификацией.
import { createClient } from '@supabase/supabase-js'

// Тип переменных окружения, ожидаемых приложением.
type Env = {
	SUPABASE_URL: string
	SUPABASE_ANON_KEY: string
	SUPABASE_SERVICE_ROLE_KEY: string
}

// Чтение переменных окружения из Bun.env.
const env: Env = {
	SUPABASE_URL: Bun.env.SUPABASE_URL || '',
	SUPABASE_ANON_KEY: Bun.env.SUPABASE_ANON_KEY || '',
	SUPABASE_SERVICE_ROLE_KEY: Bun.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

// Создаём Hono‑приложение
const app = new Hono()

// Логирование всех входящих HTTP‑запросов
app.use('*', logger())
// Включаем CORS для всех маршрутов
app.use('*', cors())

// Раздача статических файлов (frontend)
app.get('/', serveStatic({ root: './public', path: 'index.html' }))
app.get('/styles.css', serveStatic({ root: './public', path: 'styles.css' }))
app.get('/app.js', serveStatic({ root: './public', path: 'app.js' }))
app.get('/favicon.ico', c => c.body(null, 204))


// Вспомогательные функции для работы с Supabase
/** Возвращает анонимный клиент Supabase (без сохранения сессии в SDK). */
function getSupabaseAnonClient() {
	return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

/** Создаёт клиент Supabase на основе заголовка Authorization: Bearer <JWT>. */
function getSupabaseClientFromAuthHeader(authHeader?: string | null) {
	const token = authHeader?.startsWith('Bearer ')
		? authHeader.substring('Bearer '.length)
		: undefined
	if (!token) return { supabase: getSupabaseAnonClient(), token: undefined }
	const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
		auth: { persistSession: false },
		global: { headers: { Authorization: `Bearer ${token}` } }
	})
	return { supabase, token }
}

// OAuth: выдаём URL авторизации у провайдера (по умолчанию Google)

app.get('/api/auth/url', (c) => {
	const provider = c.req.query('provider') || 'google'
	const origin = new URL(c.req.url).origin
	const redirectTo = c.req.query('redirect_to') || `${origin}/`
	const url = `${env.SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}&scope=openid%20email%20profile&prompt=consent&response_type=token&flow_type=implicit`
	return c.json({ url })
})

// Health-check: проверка доступности Supabase (пробный запрос к таблице posts)
app.get('/api/health/supabase', async (c) => {
	const envOk = {
		SUPABASE_URL: Boolean(env.SUPABASE_URL),
		SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY)
	}
	const { supabase } = getSupabaseClientFromAuthHeader(undefined)
	let reachable = false
	let error: string | null = null
	try{
		const { error: qErr } = await supabase.from('posts').select('id').limit(1)
		reachable = !qErr
		if (qErr) error = qErr.message
	}catch(e:any){
		reachable = false
		error = e?.message || 'Unknown error'
	}
	return c.json({ env: envOk, supabase: { reachable, error } })
})

// API: посты, комментарии и лайки
// Таблицы: posts (демо данные), comments, likes

// Получить список постов (публично)
app.get('/api/posts', async (c) => {
	const { supabase } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false })
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Получить комментарии; можно фильтровать по post_id
app.get('/api/comments', async (c) => {
	const { supabase } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	const postId = c.req.query('post_id')
	let query = supabase.from('comments').select('*').order('created_at', { ascending: true })
	if (postId) query = query.eq('post_id', postId)
	const { data, error } = await query
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Создать комментарий (требуется аутентификация)
app.post('/api/comments', async (c) => {
	const { supabase, token } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	if (!token) return c.json({ error: 'Unauthorized' }, 401)
	const userRes = await supabase.auth.getUser()
	if (userRes.error || !userRes.data.user) return c.json({ error: 'Unauthorized' }, 401)
	const user = userRes.data.user
	const body = await c.req.json()
	const { post_id, content, author_name } = body
	const insertRow = { post_id, content, author_name, author_id: user.id }
	const { data, error } = await supabase.from('comments').insert(insertRow).select('*').single()
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Обновить комментарий по id (только владелец; проверка через RLS)
app.patch('/api/comments/:id', async (c) => {
	const { supabase, token } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	if (!token) return c.json({ error: 'Unauthorized' }, 401)
	const id = c.req.param('id')
	const body = await c.req.json()
	const { content } = body
	const { data, error } = await supabase.from('comments').update({ content }).eq('id', id).select('*').single()
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Удалить комментарий по id (только владелец; проверка через RLS)
app.delete('/api/comments/:id', async (c) => {
	const { supabase, token } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	if (!token) return c.json({ error: 'Unauthorized' }, 401)
	const id = c.req.param('id')
	const { error } = await supabase.from('comments').delete().eq('id', id)
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ ok: true })
})

// Получить лайки; можно фильтровать по post_id
app.get('/api/likes', async (c) => {
	const { supabase } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	const postId = c.req.query('post_id')
	let query = supabase.from('likes').select('*')
	if (postId) query = query.eq('post_id', postId)
	const { data, error } = await query
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Поставить лайк (требуется аутентификация)
app.post('/api/likes', async (c) => {
	const { supabase, token } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	if (!token) return c.json({ error: 'Unauthorized' }, 401)
	const userRes = await supabase.auth.getUser()
	if (userRes.error || !userRes.data.user) return c.json({ error: 'Unauthorized' }, 401)
	const user = userRes.data.user
	const body = await c.req.json()
	const { post_id, author_name } = body
	const { data, error } = await supabase.from('likes').insert({ post_id, author_name, author_id: user.id }).select('*').single()
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ data })
})

// Удалить лайк по id (только владелец; проверка через RLS)
app.delete('/api/likes/:id', async (c) => {
	const { supabase, token } = getSupabaseClientFromAuthHeader(c.req.header('authorization'))
	if (!token) return c.json({ error: 'Unauthorized' }, 401)
	const id = c.req.param('id')
	const { error } = await supabase.from('likes').delete().eq('id', id)
	if (error) return c.json({ error: error.message }, 500)
	return c.json({ ok: true })
})

// Запускаем HTTP‑сервер (по умолчанию порт 3000)
const port = Number(Bun.env.PORT || 3000)
serve({ fetch: app.fetch, port }) // Bun: запуск сервера с обработчиком Hono
console.log(`Server running at http://localhost:${port}`)


