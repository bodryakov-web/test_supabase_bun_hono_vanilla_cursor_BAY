// Фронтенд: отрисовка UI, вызовы API и авторизация через Supabase OAuth
// Токен доступа (если есть) хранится в sessionStorage между перезагрузками
let accessToken = (typeof sessionStorage!=='undefined' && sessionStorage.getItem('accessToken')) || null
// Инстанс клиента Supabase (лениво создаётся при наличии публичных ключей)
let supabaseClient = null

// Вспомогательный вызов API с автоматической подстановкой Authorization
async function api(path, opts={}){
	const headers = { 'Content-Type':'application/json' }
	if (accessToken) headers['Authorization'] = 'Bearer '+accessToken
	const res = await fetch(path, { headers, ...opts })
	const json = await res.json().catch(()=>({}))
	if(!res.ok) throw new Error(json.error||('HTTP '+res.status))
	return json
}

// Утилита: декларативное создание DOM‑узлов
function el(tag, attrs={}, ...children){
	const e = document.createElement(tag)
	Object.entries(attrs).forEach(([k,v])=>{
		if(k==='class') e.className=v
		else if(k.startsWith('on') && typeof v==='function') e.addEventListener(k.slice(2), v)
		else e.setAttribute(k, v)
	})
	children.flat().forEach(c=>{
		if(c==null) return
		e.appendChild(typeof c==='string'?document.createTextNode(c):c)
	})
	return e
}

// Обновление элементов UI в зависимости от статуса авторизации
function updateAuthUI(){
	const loginBtn = document.getElementById('login')
	const logoutBtn = document.getElementById('logout')
	const statusEl = document.getElementById('auth-status')
	if (!loginBtn || !logoutBtn) return
	const isAuthed = Boolean(accessToken)
	loginBtn.style.display = isAuthed ? 'none' : ''
	logoutBtn.style.display = isAuthed ? '' : 'none'
	if (statusEl){
		statusEl.textContent = isAuthed ? 'Авторизован' : 'Гость'
		statusEl.style.color = isAuthed ? '#10b981' : 'var(--muted)'
	}
}

// Загрузка списка постов и заполнение селектов
async function loadPosts(){
	const { data } = await api('/api/posts')
	const postsDiv = document.getElementById('posts')
	postsDiv.innerHTML=''
	const list = el('div',{class:'list'},
		...data.map(p=>el('div',{class:'item'},
			el('div',{class:'row'},
				el('b',{}, p.title),
				el('span',{class:'small'}, new Date(p.created_at).toLocaleString('ru-RU'))
			),
			el('div',{}, p.body||'')
		))
	)
	postsDiv.appendChild(list)
	// fill selects
	const opts = data.map(p=>el('option',{value:p.id}, p.title))
	const sel1 = document.getElementById('post_id')
	const sel2 = document.getElementById('like_post_id')
	sel1.replaceChildren(...opts.map(o=>o.cloneNode(true)))
	sel2.replaceChildren(...opts.map(o=>o.cloneNode(true)))
}

// Загрузка комментариев для выбранного поста
async function loadComments(){
	const postId = document.getElementById('post_id').value
	const { data } = await api('/api/comments'+(postId?`?post_id=${encodeURIComponent(postId)}`:''))
	const container = document.getElementById('comments')
	container.innerHTML=''
	const list = el('div',{class:'list'},
		...data.map(c=> el('div',{class:'item'},
			el('div',{class:'row'},
				el('b',{}, c.author_name||'Аноним'),
				el('span',{class:'small'}, new Date(c.created_at).toLocaleString('ru-RU'))
			),
			el('div',{}, c.content),
			el('div',{class:'actions'},
				el('button',{onclick:()=>onEditComment(c)},'Изменить'),
				el('button',{onclick:()=>onDeleteComment(c.id)},'Удалить')
			)
		))
	)
	container.appendChild(list)
}

// Загрузка и агрегация лайков по постам
async function loadLikes(){
	const postId = document.getElementById('like_post_id').value
	const { data } = await api('/api/likes'+(postId?`?post_id=${encodeURIComponent(postId)}`:''))
	const container = document.getElementById('likes')
	container.innerHTML=''
	const counts = data.reduce((acc, l)=>{acc[l.post_id]=(acc[l.post_id]||0)+1; return acc}, {})
	const list = el('div',{class:'list'},
		...Object.entries(counts).map(([pid,count])=> el('div',{class:'item'}, `Пост #${pid}: ${count} лайков`))
	)
	container.appendChild(list)
}

// Удаление комментария (подтверждение + API)
async function onDeleteComment(id){
	if(!confirm('Удалить комментарий?')) return
	await api('/api/comments/'+id,{ method:'DELETE' })
	await loadComments()
}

// Редактирование комментария (prompt) и отправка изменений
function onEditComment(c){
	const nv = prompt('Новый текст комментария', c.content)
	if(nv==null) return
	api('/api/comments/'+c.id,{ method:'PATCH', body: JSON.stringify({ content: nv }) })
		.then(loadComments)
		.catch(e=>alert(e.message))
}

// Сабмит формы добавления комментария
document.getElementById('comment-form').addEventListener('submit', async (e)=>{
	e.preventDefault()
	const post_id = document.getElementById('post_id').value
	const author_name = document.getElementById('author_name').value
	const content = document.getElementById('content').value
	try{
		await api('/api/comments',{ method:'POST', body: JSON.stringify({ post_id, author_name, content }) })
		;(document.getElementById('content')).value=''
		await loadComments()
	}catch(err){
		alert(err.message||'Ошибка отправки комментария')
	}
})

// Сабмит формы лайка
document.getElementById('like-form').addEventListener('submit', async (e)=>{
	e.preventDefault()
	const post_id = document.getElementById('like_post_id').value
	const author_name = document.getElementById('like_author_name').value
	try{
		await api('/api/likes',{ method:'POST', body: JSON.stringify({ post_id, author_name }) })
		await loadLikes()
	}catch(err){
		alert(err.message||'Ошибка отправки лайка')
	}
})

// Инициализация приложения после загрузки страницы
window.addEventListener('load', async ()=>{
	await loadPosts()
	await loadComments()
	await loadLikes()
	// reload lists when selects change
	document.getElementById('post_id').addEventListener('change', ()=>{ loadComments() })
	document.getElementById('like_post_id').addEventListener('change', ()=>{ loadLikes() })

	updateAuthUI()
})

// Minimal OAuth via implicit flow using Supabase hosted UI.
// We read access_token from hash if present, then remove it from URL.
// Инициализация авторизации из access_token в hash/URL (implicit flow)
;(function initAuthFromHash(){
	const hash = new URLSearchParams(location.hash.slice(1))
	const qs = new URLSearchParams(location.search)
	const token = hash.get('access_token') || qs.get('access_token')
	if (token){
		accessToken = token
		try{ sessionStorage.setItem('accessToken', token) }catch(_){ }
		history.replaceState(null,'',location.pathname+location.search)
		updateAuthUI()
	}
})()

// Делегирование кликов: обработка входа/выхода
document.addEventListener('click', async (e)=>{
	const t = e.target
	if (t.matches('#login')){
		if (supabaseClient){
			await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })
		}else{
			const redirectTo = location.origin + location.pathname
			const { url } = await api('/api/auth/url?provider=google&redirect_to='+encodeURIComponent(redirectTo))
			location.href = url
		}
	}
	if (t.matches('#logout')){
		accessToken = null
		if (supabaseClient){ try{ await supabaseClient.auth.signOut() }catch(_){ } }
		try{ sessionStorage.removeItem('accessToken') }catch(_){ }
		alert('Вы вышли из системы')
		updateAuthUI()
	}
})


