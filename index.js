import { Application, Router, send } from "jsr:@oak/oak@17.1.6"
import Handlebars from "npm:handlebars@^4.7.8"
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts"
import * as jose from "https://deno.land/x/jose@v4.14.1/index.ts"

const rhost = Deno.env.get("RHOST_ENDPOINT") || "http://%2322222umicupcake@127.0.0.1:2061/"
const SERVER_START_TIME = Date.now()

async function mysql() {
	const mysql = await new Client().connect({
		hostname: Deno.env.get("MYSQL_HOST"),
		username: Deno.env.get("MYSQL_USER"),
		password: Deno.env.get("MYSQL_PASS"),
		db: Deno.env.get("MYSQL_DB")
	})
	return mysql
}

function rhostbtoa(str) {
	return btoa(str.replace(/[^\x00-\x7F]/g, ''))
}

function escapeInput(str) {
	return str.replaceAll(/ /g, '%b').replaceAll(/\n/g,'%r').replaceAll(/\}/g,'%}').replaceAll(/\{/g,'%{').replaceAll(/\[/g,'\\[').replaceAll(/;/g,'%;').replaceAll(/["]/g,'\\"').replaceAll(/\{\}/g,'').replaceAll(/\(/g,'%(').replaceAll(/\)/g,'%)').replaceAll(/,/g,'%,')
}

async function rhostExec(exec) {
	try {
		const response = await fetch(rhost, {
			headers: {
				parse: 'ansiparse',
				encode: 'yes',
				exec64: rhostbtoa(exec)
			}
		})
		
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`)
		}
		return atob(response.headers.get('return'))
	} catch(e) {
		if(e.name !== 'TypeError' || !e.message.includes('fetch')) {
			console.log('[rhostExec] ERROR', e)
			return false
		} else {
			return this.rhostExec(exec)
		}
	}
}

async function rhostLua(exec) {
	try {
		exec = exec.replace(/^\t+/gm, (match) => match.replaceAll("\t", "    "))

		const response = await fetch(rhost, {
			headers: {
				"x-lua64": rhostbtoa(exec)
			}
		})
		const final = await response.text()

		if(typeof final == "object") {
			return final
		} else {
			try {
				return JSON.parse(final)
			} catch(e) {
				console.log("[rhostLua] Failed to parse JSON: ", e, final)
				return {
					error: final
				}
			}
		}
	} catch(e) {
		if(e.name != 'AbortError') {
			console.log('[rhostLua] ERROR', e)
			return {
				error: `${e}`
			}
		} else {
			// console.log('[rhostLua] CONNRESET, retrying')
			return this.rhostLua(exec)
		}
	}
}

async function rhostCheckLogin(accountName, password, characterName = undefined) {
	const accountRef = await rhostExec(`[namegrab(searchngobjid(TOTEMS=A),${escapeInput(accountName)})]`)
	const characterRef = await rhostExec(`[namegrab(searchngobjid(type=players),${escapeInput(characterName)})]`)
	const hasAccount = await rhostExec(`[streq(get(${characterRef}/_ACCOUNT),${accountRef})]`) == "1"
	const checkPass = await rhostExec(`[attrpass(${accountRef}/_PASSWORD, ${escapeInput(password)}, chk)]`) == "1"
	const ret = {
		accountRef,
		characterRef,
		hasAccount,
		checkPass
	}
	if(ret.checkPass && ret.hasAccount) {
		return { characterRef: ret.characterRef }
	} else {
		return {}
	}
}

// JWT functions
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "change-this-in-production"
const jwtSecret = new TextEncoder().encode(JWT_SECRET)

async function createJWT(accountName, characterName, bittype) {
	const token = await new jose.SignJWT({ accountName, characterName, bittype })
		.setProtectedHeader({ alg: 'HS256' })
		.setExpirationTime('7d')
		.sign(jwtSecret)
	return token
}

async function verifyJWT(token) {
	try {
		const verified = await jose.jwtVerify(token, jwtSecret)
		return verified.payload
	} catch (error) {
		return null
	}
}

// Logging functions
async function logAccess(method, url, status, userAgent, ip, timestamp) {
	const logLine = `${timestamp} - ${ip} - "${method} ${url}" ${status} "${userAgent}"\n`
	try {
		console.log(logLine)
		await Deno.writeTextFile("/app/logs/access.log", logLine, { append: true })
	} catch (error) {
		console.error("Failed to write access log:", error)
	}
}

async function logError(error, context = "") {
	const timestamp = new Date().toISOString()
	const logLine = `${timestamp} - ERROR - ${context}: ${error.message}\n${error.stack}\n\n`
	try {
		await Deno.writeTextFile("/app/logs/error.log", logLine, { append: true })
	} catch (writeError) {
		console.error("Failed to write error log:", writeError)
	}
	console.error(`${context}:`, error)
}

async function initializeHandlebars() {
	// Register site layout
	const siteLayout = await Deno.readTextFile("/app/templates/layouts/site.hbs")
	const siteTemplate = Handlebars.compile(siteLayout)

	// Load and register all partials
	try {
		for await (const dirEntry of Deno.readDir("/app/templates/partials")) {
			if (dirEntry.isFile && dirEntry.name.endsWith(".hbs")) {
				const partialName = dirEntry.name.replace(".hbs", "")
				const partialContent = await Deno.readTextFile(`/app/templates/partials/${dirEntry.name}`)
				Handlebars.registerPartial(partialName, partialContent)
			}
		}
	} catch (error) {
		console.log("No partials directory or files found:", error.message)
	}

	// Register cachebuster helper
	Handlebars.registerHelper("cachebuster", (path) => {
		return `${path}?v=${SERVER_START_TIME}`
	})

	// Document renderer helper - converts Keystone document structure to HTML
	Handlebars.registerHelper("renderDocument", (document) => {
		if (!document || !Array.isArray(document)) return ""
		
		const escapeHtml = (text) => {
			return String(text)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
		}
		
		const renderNode = (node) => {
			// Text node with marks
			if (typeof node.text === 'string') {
				let html = escapeHtml(node.text)
				if (node.bold) html = `<strong>${html}</strong>`
				if (node.italic) html = `<em>${html}</em>`
				if (node.underline) html = `<u>${html}</u>`
				if (node.strikethrough) html = `<s>${html}</s>`
				if (node.code) html = `<code>${html}</code>`
				if (node.superscript) html = `<sup>${html}</sup>`
				if (node.subscript) html = `<sub>${html}</sub>`
				if (node.keyboard) html = `<kbd>${html}</kbd>`
				return html
			}
			
			// Element node
			const childrenHtml = (node.children || []).map(renderNode).join('')
			const style = node.textAlign ? ` style="text-align: ${node.textAlign}"` : ""
			
			switch (node.type) {
				case 'paragraph': return `<p${style}>${childrenHtml}</p>`
				case 'heading': return `<h${node.level || 1}${style}>${childrenHtml}</h${node.level || 1}>`
				case 'blockquote': return `<blockquote>${childrenHtml}</blockquote>`
				case 'code': return `<pre><code>${childrenHtml}</code></pre>`
				case 'divider': return `<hr>`
				case 'ordered-list': return `<ol>${childrenHtml}</ol>`
				case 'unordered-list': return `<ul>${childrenHtml}</ul>`
				case 'list-item': return `<li>${childrenHtml}</li>`
				case 'layout': {
					const gridCols = (node.layout || [1]).map(x => `${x}fr`).join(' ')
					return `<div style="display: grid; grid-template-columns: ${gridCols};">${childrenHtml}</div>`
				}
				case 'layout-area': return `<div>${childrenHtml}</div>`
				case 'link': return `<a href="${escapeHtml(node.href || '')}">${childrenHtml}</a>`
				case 'image': {
					const src = escapeHtml(node.src || '')
					const alt = escapeHtml(node.alt || '')
					const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
					return `<img src="${src}" alt="${alt}"${title} />`
				}
				case 'relationship': {
					const label = node.data?.label || node.data?.id || '(unknown)'
					return `<span class="relationship" data-id="${escapeHtml(node.data?.id || '')}">${escapeHtml(label)}</span>`
				}
				case 'component-block': {
				// Handle image component block
				if (node.component === 'image') {
					// The image relationship is stored as node.props.image which is an object with data property
					const imageData = node.props?.image?.data
					const imageUrl = imageData?.image?.url
					const alt = escapeHtml(node.props?.alt || '')
					const caption = escapeHtml(node.props?.caption || '')
					const float = node.props?.float || 'none'
					
					if (!imageUrl) {
						return ''
					}
					
					const style = float === 'none'
						? 'margin: 1rem 0; text-align: center;'
						: float === 'left'
							? 'float: left; margin: 0 1rem 1rem 0; max-width: 300px;'
							: 'float: right; margin: 0 0 1rem 1rem; max-width: 300px;'
					
					const captionHtml = caption ? `<p style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: #666; font-style: italic;">${caption}</p>` : ''
					
					return `<div style="${style}"><img src="${escapeHtml(imageUrl)}" alt="${alt}" style="max-width: 100%; height: auto; display: block; border-radius: 4px;" />${captionHtml}</div>`
				}
				// For other component blocks, just render their children
				return childrenHtml
			}
				default: return childrenHtml
			}
		}
		
		const html = document.map(renderNode).join('')
		return new Handlebars.SafeString(html)
	})

	// Navigation helper - returns nav data that was preloaded during renderPage
	Handlebars.registerHelper("nav", function(slug) {
		// The data is passed as context, so we can access it via this
		if (slug === "main" && this.nav) {
			return this.nav
		}
		return []
	})

	console.log("Handlebars initialized with templates, partials, and helpers")

	return siteTemplate
}

async function renderPage(siteTemplate, templatePath, data = {}) {
	var pageContent = await Deno.readTextFile(templatePath)

	// Parse JSON from HTML comment at start of file
	var page = {}
	var htmlCommentRegex = /^<!--\s*(\{.*?\})\s*-->/s
	var match = pageContent.match(htmlCommentRegex)
	if (match) {
		try {
			page = JSON.parse(match[1])
		} catch (error) {
			console.warn(`Failed to parse JSON from template ${templatePath}:`, error)
		}
	}

	// If cmspage data is provided, merge it into page metadata for the layout
	if (data.cmspage) {
		page = { ...page, ...data.cmspage }
	}

	// Fetch navigation data if not already provided
	if (!data.nav) {
		const navQuery = `query{navigations(where:{slug:{equals:"main"}}){isActive items(orderBy:{sort:asc}){label url target sort isActive cssClass icon children(orderBy:{sort:asc}){label url target sort isActive cssClass icon}}}}`
		const navResp = await fetch("http://keystone:3000/api/graphql", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({query: navQuery})})
		const navResult = await navResp.json()
		const nav = navResult.data?.navigations?.[0]
		if (nav && nav.isActive) {
			data.nav = nav.items.filter(i => i.isActive)
		}
	}

	var cmspage = data.cmspage || {}
	var pageTemplate = Handlebars.compile(pageContent)
	var renderedPage = pageTemplate({ ...data, page, cmspage })

	// Inject the rendered page into the layout
	return siteTemplate({ ...data, page, cmspage, body: renderedPage })
}

async function main() {
	const siteTemplate = await initializeHandlebars()

	const app = new Application()
	const router = new Router()

	// Auth middleware - parse JWT from auth cookie and set user context
	app.use(async (ctx, next) => {
		ctx.state.user = null
		const token = ctx.cookies.get('auth')
		if (token) {
			const payload = await verifyJWT(token)
			if (payload) {
				ctx.state.user = payload
			}
		}
		await next()
	})

	// Access logging middleware
	app.use(async (ctx, next) => {
		const start = Date.now()
		const timestamp = new Date().toISOString()

		try {
			await next()
		} catch (error) {
			await logError(error, `Request ${ctx.request.method} ${ctx.request.url.pathname}`)
			ctx.response.status = 500
			ctx.response.body = { error: "Internal Server Error" }
		} finally {
			const ms = Date.now() - start
			const userAgent = ctx.request.headers.get("user-agent") || "-"
			const ip = ctx.request.headers.get("x-forwarded-for") ||
			           ctx.request.headers.get("x-real-ip") ||
			           ctx.request.ip || "-"

			await logAccess(
				ctx.request.method,
				ctx.request.url.pathname + ctx.request.url.search,
				ctx.response.status || 404,
				userAgent,
				ip,
				timestamp
			)
		}
	})

	// Static file serving
	router.get("/static/:path+", async (ctx) => {
		try {
			const filePath = ctx.params.path
			await send(ctx, filePath, {
				root: "/app/static",
				index: "index.html"
			})
		} catch (error) {
			if (error.status === 404) {
				ctx.response.status = 404
				ctx.response.body = { error: "File not found" }
			} else {
				await logError(error, "Static file serving")
				ctx.response.status = 500
				ctx.response.body = { error: "Failed to serve static file" }
			}
		}
	})

	// Fallback handler to check Keystone for pages
	const keystonePageFallback = async (ctx) => {
		let url = ctx.request.url.pathname
		// Normalize to trailing slash if not present and no file extension
		if (!url.endsWith("/") && !url.includes(".")) {
			ctx.response.status = 302
			ctx.response.headers.set("Location", url + "/")
			return
		}
		
		// Use full path as slug
		const slug = url

		try {
			const query = `query{pages(where:{slug:{equals:"${slug}"}}){id title slug status content{document(hydrateRelationships:true)} publishedAt}}`

			const response = await fetch('http://keystone:3000/api/graphql', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query })
			})

			const data = await response.json()

			if (data.errors || !response.ok) {
				console.log(`[GraphQL Response] Status: ${response.status}, Body:`, JSON.stringify(data))
				throw new Error(`GraphQL error: ${JSON.stringify(data.errors || data)}`)
			}

			if (data.data?.pages?.length > 0) {
				const page = data.data.pages[0]
				// Only serve published pages
				if (page.status === 'published') {
					const pageData = {
						user: ctx.state.user || null,
						cmspage: {
							title: page.title,
							slug: page.slug,
							content: page.content.document
						}
					}

					const html = await renderPage(siteTemplate, "/app/templates/pages/keystone-page.hbs", pageData)
					ctx.response.headers.set("Content-Type", "text/html")
					ctx.response.body = html
					return
				}
			}
		} catch (error) {
			await logError(error, "Keystone page fallback")
		}

		// No page found, render 404 page
		ctx.response.status = 404
		const html = await renderPage(siteTemplate, "/app/templates/pages/404.hbs", { user: ctx.state.user || null })
		ctx.response.headers.set("Content-Type", "text/html")
		ctx.response.body = html
	}

	router.get("/gapi/logs/get/:key", async (ctx) => {
		try {
			const sceneKey = ctx.params.key
			const client = await mysql()

		const sceneResult = await client.query(`
SELECT *
FROM scene
WHERE scene_id = ? AND scene_status != -1
			`, [sceneKey])

		if (!sceneResult || sceneResult.length === 0) {
			ctx.response.status = 404
			ctx.response.body = { error: "Scene not found" }
			return
		}

		const sceneData = sceneResult[0]

		const poses = await client.query(`
SELECT
  p.pose_id,
  p.pose_text,
  p.pose_date_created as pose_date,
  ch.channel_name,
  ch.channel_category,
  ar.actrole_name,
  e.entity_name,
  e.entity_objid
FROM channel ch
LEFT JOIN pose p ON p.channel_id = ch.channel_id AND p.pose_is_deleted = 0
LEFT JOIN actrole ar ON ar.actrole_id = p.actrole_id
LEFT JOIN actor a ON a.actor_id = ar.actor_id
LEFT JOIN entity e ON e.entity_id = a.entity_id
WHERE ch.scene_id = ?
ORDER BY p.pose_date_created ASC
			`, [sceneKey])

		const statusMap = {
			"-1": "Deleted",
			"0": "Scheduled",
			"1": "Active",
			"2": "Paused",
			"3": "Finished"
		}

		const formattedPoses = poses
			.filter(p => p.pose_id !== null)
			.map(p => ({
				pose_id: p.pose_id,
				pose_text: p.pose_text,
				pose_date: p.pose_date,
				channel_name: p.channel_name,
				channel_category: p.channel_category,
				actrole_name: p.actrole_name,
				entity_name: p.entity_name,
				entity_objid: p.entity_objid
			}))

		ctx.response.status = 200
		ctx.response.body = {
			scene: {
				...sceneData,
				scene_status: statusMap[sceneData.scene_status] || "Unknown"
			},
			poses: formattedPoses
		}
		} catch (error) {
			await logError(error, "GET /api/logs/get/:key")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to get log" }
		}
	})

	router.get("/logs/:key(\\d+)/", async (ctx) => {
		const sceneKey = ctx.params.key

		try {
			const data = {
				user: ctx.state.user || null,
				sceneKey
			}

			const html = await renderPage(siteTemplate, "/app/templates/pages/logs/key.hbs", data)
			ctx.response.headers.set("Content-Type", "text/html")
			ctx.response.body = html
		} catch (error) {
			await logError(error, "/logs/:key")
			throw error
		}
	})

	router.get("/gapi/characters/get/", async (ctx) => {
		const luaScript = `
ret = {}
playersRaw = rhost.strfunc("search", "type=player")
for dbref in string.gmatch(playersRaw, "([^%s]+)") do
	pcobjid = rhost.strfunc("objid", dbref)
	pctotem = rhost.strfunc("eval", "[hastotem(" .. dbref .. ",PC)]") == '1'
	approved = rhost.strfunc("eval", "[hasflag(" .. dbref .. ",WANDERER)]") == '0'
	bittype = tonumber(rhost.strfunc("bittype", dbref))
	npc = not pctotem and not approved and bittype == 0
	pc = approved and pctotem and bittype <= 1
	staff = pctotem and bittype > 1
	if pc or npc or staff then
		char = {}
		char.name = rhost.strfunc("name", dbref)
		char.cname = rhost.parseansi(rhost.strfunc("cname", dbref))
		char.bittype = rhost.strfunc("bittype", dbref)
		char.approved = rhost.strfunc("eval", "[hasflag(" .. dbref .. ",WANDERER)]") == '0'
		char.dbref = dbref
		char.pc = pc
		char.npc = npc
		char.staff = staff
		char.objid = pcobjid
		table.insert(ret, char)
	end
end
return json.encode(ret)
`
		var ret = []
		try {
			ret = await rhostLua(luaScript)
		} catch(e) {
			console.log("[/api/characters/get/] error:", e)
			ret = []
		}

		ctx.response.status = 200
		ctx.response.body = ret
	})

	router.get("/gapi/characters/get/:key", async (ctx) => {
		const dbref = `${ctx.params.key}`
		const luaScript = `
datatypes = {
	["Info Files"] = "#info",
	["Theme"] = "#theme",
	["Faction"] = "#faction",
	["Abilities"] = "#abi_info",
	["Copied Powers"] = "#copy_info",
	["Resources"] = "#res_info",
	["NPCs"] = "#npc_info",
	["Extra Data"] = "#ext_info",
	["Complications"] = "#com_info"
}

char = {}
dbref = "${dbref}"
pctotem = rhost.strfunc("eval", "[hastotem(" .. dbref .. ",PC)]") == '1'
approved = rhost.strfunc("eval", "[hasflag(" .. dbref .. ",WANDERER)]") == '0'
bittype = tonumber(rhost.strfunc("bittype", dbref))
npc = not pctotem and not approved and bittype == 0
pc = approved and pctotem and bittype <= 1
staff = pctotem and bittype > 1
if not (pc or npc or staff) then
	char = { error = 404 }
else
	char.finger = {}
	fingersRaw = rhost.strfunc("lattr", dbref .. "/finger.*")
	for attr in string.gmatch(fingersRaw, "([^%s]+)") do
		value = rhost.parseansi(rhost.strfunc("get", dbref .. "/" .. attr))
		key = string.gsub(attr, "FINGER.", "")
		char.finger[key] = value
	end

	char.data = {}
	for name, ref in pairs(datatypes) do
		category = {}

		attrs = rhost.strfunc("eval", "[u(" .. ref .. "/FN.LIST_ATTRS_ORDER," .. dbref .. ")]")

		for attr in string.gmatch(attrs, "([^%s]+)") do
			rec = {}
			local baseget = dbref .. "/" .. attr
			rec.name = rhost.strfunc("get", baseget .. ".NAME")
			rec.value = rhost.strfunc("get", baseget .. ".VALUE")
			rec.body = rhost.parseansi(rhost.strfunc("get", baseget .. ".BODY"))
			rec.summary = rhost.parseansi(rhost.strfunc("get", baseget .. ".SUMMARY"))
			table.insert(category, rec)
		end

		char.data[name] = category
	end

	themeref = rhost.strfunc("get", dbref .. "/game.theme")
	char.theme = rhost.strfunc("name", themeref)

	char.factions = {}
	factionrefs = rhost.strfunc("get", dbref .. "/fac.memberships")
	for factionref in string.gmatch(factionrefs, "([^%s]+)") do
		hidden = rhost.strfunc("eval", "[getconf(" .. factionref .. ", HIDDEN)") == "1"
		private = rhost.strfunc("eval", "[getconf(" .. factionref .. ", PRIVATE)") == "1"
		if not hidden and not private then
			faction = {
				name = rhost.strfunc("name", factionref)
			}
			table.insert(char.factions, faction)
		end
	end

	char.objid = rhost.strfunc("objid", dbref)
	char.sex = rhost.strfunc("get", dbref .. "/SEX")
	char.name = rhost.strfunc("name", dbref)
	char.cname = rhost.parseansi(rhost.strfunc("cname", dbref))
	char.bittype = rhost.strfunc("bittype", dbref)
	char.approved = rhost.strfunc("eval", "[hasflag(" .. dbref .. ",WANDERER)]") == '0'
	char.dbref = dbref
	char.pc = pc
	char.npc = npc
	char.staff = staff
end
return json.encode(char)
`
		var ret = {}
		try {
			ret = await rhostLua(luaScript)
		} catch(e) {
			console.log("[/api/characters/get/] error:", e)
			ret = {}
		}

		ctx.response.status = 200
		ctx.response.body = ret
	})

	router.post("/gapi/characters/edit/", async (ctx) => {
		try {
			const payload = await ctx.request.body.json()

			const { accountName, password, characterName, portrait, gallery, css, banner } = payload

			// Validate required fields
			if(!accountName || !password || !characterName) {
				ctx.response.status = 400
				ctx.response.body = { error: "Missing required fields: accountName, password, characterName" }
				return
			}

			const checkLogin = await rhostCheckLogin(accountName, password, characterName)

			if(!checkLogin?.characterRef) {
				ctx.response.status = 403
				ctx.response.body = { error: "Invalid account name, password, or character name" }
				return
			}

			const triggerInfo = async (type, val) => {
				const script = `
str = rhost.strfunc("eval", "[trigger(#info/do_info,,,,${checkLogin.characterRef},/,${type},${escapeInput(val)})]")
return '"' .. str .. '"'
`
				return await rhostLua(script)
			}
			if(css) {
				const resp = await triggerInfo("css", css)
				console.log("[/api/characters/edit/] css returns:", resp)
			}

			if(gallery) {
				const resp = await triggerInfo("gallery", gallery)
				console.log("[/api/characters/edit/] galleryreturns:", resp)
			}

			if(portrait) {
				const resp = await triggerInfo("portrait", portrait)
				console.log("[/api/characters/edit/] portrait returns:", resp)
			}

			if(banner) {
				const resp = await triggerInfo("banner", banner)
				console.log("[/api/characters/edit/] banner returns:", resp)
			}

			ctx.response.status = 200
			ctx.response.body = { success: true, message: "Character edited!" }
		} catch (error) {
			await logError(error, "POST /api/characters/edit")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to process character edit" }
		}
	})

	router.post("/gapi/logs/list/", async (ctx) => {
		try {
			const payload = await ctx.request.body.json()
			const start = payload?.start || 0
			const desc = payload?.desc ? "DESC" : "ASC"

			const client = await mysql()

			const scenes = await client.query(`
SELECT
  s.*,
  COALESCE(ax.actors, JSON_ARRAY()) AS actors
FROM (
  SELECT *
  FROM scene
  WHERE scene_status != -1
  ORDER BY scene_id ${desc}
  LIMIT ?, 50
) s
LEFT JOIN (
  SELECT
    g.scene_id,
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'actor_id', g.actor_id,
        'entity_id', g.entity_id,
        'actor_type', g.actor_type,
        'entity_name', e.entity_name,
        'entity_objid', e.entity_objid,
        'action_count', g.action_count,
        'first_action', g.first_action,
        'last_action', g.last_action
      )
    ) AS actors
  FROM (
    SELECT
      a.scene_id,
      a.actor_id,
      a.entity_id,
      a.actor_type,
      COUNT(*) AS action_count,
      MIN(a.actor_date_created) AS first_action,
      MAX(a.actor_date_created) AS last_action
    FROM actor a
    INNER JOIN actrole ar ON ar.actor_id = a.actor_id
    INNER JOIN pose p ON p.actrole_id = ar.actrole_id AND p.pose_is_deleted = 0
    INNER JOIN channel ch ON ch.channel_id = p.channel_id AND ch.channel_name = 'Actions'
    GROUP BY
      a.scene_id,
      a.actor_id,
      a.entity_id,
      a.actor_type,
      ar.actrole_id,
      p.actrole_id,
      ch.channel_id
  ) g
  LEFT JOIN entity e
    ON e.entity_id = g.entity_id
  GROUP BY g.scene_id
) ax
  ON ax.scene_id = s.scene_id
ORDER BY s.scene_id ${desc};
			`, [start])
			
			const statusMap = {
				"-1": "Deleted",
				"0": "Scheduled",
				"1": "Active",
				"2": "Paused",
				"3": "Finished"
			}
			
			const parsedScenes = scenes.map(scene => ({
				...scene,
				scene_status: statusMap[scene.scene_status] || "Unknown",
				actors: typeof scene.actors === 'string' ? JSON.parse(scene.actors) : scene.actors
			}))
			ctx.response.status = 200
			ctx.response.body = parsedScenes
		} catch (error) {
			await logError(error, "POST /api/logs/list")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to list logs" }
		}
	})

	router.get("/gapi/logs/player/:objid", async (ctx) => {
		try {
			const objid = ctx.params.objid
			const client = await mysql()

			const logs = await client.query(`
SELECT DISTINCT
  s.scene_id,
  s.scene_title,
  s.scene_date_started,
  s.scene_date_scheduled
FROM scene s
INNER JOIN channel ch ON ch.scene_id = s.scene_id
INNER JOIN pose p ON p.channel_id = ch.channel_id AND p.pose_is_deleted = 0
INNER JOIN actrole ar ON ar.actrole_id = p.actrole_id
INNER JOIN actor a ON a.actor_id = ar.actor_id
INNER JOIN entity e ON e.entity_id = a.entity_id
			WHERE e.entity_objid = ?
			AND s.scene_status != -1
			AND ch.channel_name = 'Actions'
			ORDER BY s.scene_id DESC
			`, [objid])

			const formattedLogs = logs.map(log => ({
				scene_id: log.scene_id,
				scene_title: log.scene_title,
				scene_date: log.scene_date_started || log.scene_date_scheduled || null
			}))

			ctx.response.status = 200
			ctx.response.body = formattedLogs
		} catch (error) {
			await logError(error, "GET /api/logs/player/:objid")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to get player logs" }
		}
	})

	router.post("/gapi/logs/pagecount/", async (ctx) => {
		try {
			const client = await mysql()

			const result = await client.query(`
SELECT COUNT(*) AS total
FROM scene
WHERE scene_status != -1
			`)

			const total = result[0]?.total || 0
			const pageCount = Math.ceil(total / 50)

			ctx.response.status = 200
			ctx.response.body = { pageCount, total }
		} catch (error) {
			await logError(error, "POST /api/logs/pagecount")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to get page count" }
		}
	})

	router.post("/gapi/logs/upcoming/", async (ctx) => {
		try {
			const payload = await ctx.request.body.json()
			const start = payload?.start || 0

			const client = await mysql()

			const scenes = await client.query(`
SELECT
  s.*,
  e.entity_name as creator_name,
  e.entity_objid as creator_objid
FROM scene s
LEFT JOIN scene_scheduled ss ON ss.scene_id = s.scene_id
LEFT JOIN entity e ON e.entity_objid = ss.owner_objid
WHERE s.scene_status = 0 AND s.scene_date_scheduled > NOW()
ORDER BY s.scene_date_scheduled ASC
			`)

			const statusMap = {
				"-1": "Deleted",
				"0": "Scheduled",
				"1": "Active",
				"2": "Paused",
				"3": "Finished"
			}

			const parsedScenes = scenes.map(scene => ({
				...scene,
				scene_status: statusMap[scene.scene_status] || "Unknown",
				actors: typeof scene.actors === 'string' ? JSON.parse(scene.actors) : scene.actors
			}))
			ctx.response.status = 200
			ctx.response.body = parsedScenes
		} catch (error) {
			await logError(error, "POST /api/logs/upcoming")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to list upcoming logs" }
		}
	})

	router.get("/characters/:key/", async (ctx) => {
		const dbref = `#${ctx.params.key}`

		try {
			const data = {
				user: ctx.state.user || null,
				dbref
			}

			const html = await renderPage(siteTemplate, "/app/templates/pages/characters/key.hbs", data)
			ctx.response.headers.set("Content-Type", "text/html")
			ctx.response.body = html
		} catch (error) {
			await logError(error, "/characters/:key")
			throw error
		}
	})

	router.get("/logs/:key([0-9]+)/", async (ctx) => {
		const sceneKey = ctx.params.key

		try {
			const data = {
				user: ctx.state.user || null,
				sceneKey
			}

			const html = await renderPage(siteTemplate, "/app/templates/pages/logs/key.hbs", data)
			ctx.response.headers.set("Content-Type", "text/html")
			ctx.response.body = html
		} catch (error) {
			await logError(error, "/logs/:key")
			throw error
		}
	})

	// Signin routes
	router.get("/signin/", async (ctx) => {
		try {
			const data = {
				user: ctx.state.user || null
			}

			const html = await renderPage(siteTemplate, "/app/templates/pages/signin.hbs", data)
			ctx.response.headers.set("Content-Type", "text/html")
			ctx.response.body = html
		} catch (error) {
			await logError(error, "GET /signin")
			throw error
		}
	})

	router.post("/signin/", async (ctx) => {
		try {
			const body = await ctx.request.body.json()
			const { accountName, password, characterName } = body

			if (!accountName || !password || !characterName) {
				ctx.response.status = 400
				ctx.response.body = { error: "Missing required fields" }
				return
			}

			const loginResult = await rhostCheckLogin(accountName, password, characterName)

			if (!loginResult?.characterRef) {
				ctx.response.status = 401
				ctx.response.body = { error: "Invalid credentials" }
				return
			}

			// Check if user is staff (bittype > 1)
			const bittype = await rhostExec(`[bittype(${loginResult.characterRef})]`)
			const bittpNum = parseInt(bittype)

			if (bittpNum <= 1) {
				ctx.response.status = 403
				ctx.response.body = { error: "Only staff members can access the admin panel" }
				return
			}

			// Create JWT token
			const token = await createJWT(accountName, characterName, bittpNum)

			// Set JWT cookie
			ctx.cookies.set("auth", token, {
				httpOnly: true,
				secure: Deno.env.get("NODE_ENV") === "production",
				sameSite: "Lax",
				maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
			})

			ctx.response.status = 200
			ctx.response.body = { success: true, message: "Signed in successfully", token }
		} catch (error) {
			await logError(error, "POST /signin", error)
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to sign in" }
		}
	})

	// Signout endpoint
	router.post("/signout/", async (ctx) => {
		try {
			// Clear the auth cookie
			ctx.cookies.set("auth", "", {
				httpOnly: true,
				secure: Deno.env.get("NODE_ENV") === "production",
				sameSite: "Lax",
				maxAge: 0 // Expire immediately
			})

			ctx.response.status = 200
			ctx.response.body = { success: true, message: "Signed out successfully" }
		} catch (error) {
			await logError(error, "POST /signout")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to sign out" }
		}
	})

	// Centralized route configuration
	const pageRoutes = [
		{ path: "/characters/", template: "/app/templates/pages/characters/index.hbs", errorContext: "Characters list page render" },
		{ path: "/logs/", template: "/app/templates/pages/logs/index.hbs", errorContext: "Logs list page render" },
		{ path: "/logs/upcoming/", template: "/app/templates/pages/logs/upcoming.hbs", errorContext: "Upcoming logs page render" },
	]

	// Helper function for rendering page routes
	const createPageRoute = (templatePath, errorContext) => {
		return async (ctx) => {
			try {
				// Pass user data from JWT to template if available
				const data = {
					user: ctx.state.user || null
				}

				const html = await renderPage(siteTemplate, templatePath, data)
				ctx.response.headers.set("Content-Type", "text/html")
				ctx.response.body = html
			} catch (error) {
				await logError(error, errorContext)
				throw error
			}
		}
	}

	// Register all page routes
	pageRoutes.forEach(route => {
		router.get(route.path, createPageRoute(route.template, route.errorContext))
	})

	app.use(router.routes())
	app.use(router.allowedMethods())

	// Root path handler: try to serve home page from Keystone
	// Fallback handler: try to serve pages from Keystone
	router.get("/:path*", keystonePageFallback)

	// 404 handler for all other routes
	app.use((ctx) => {
		ctx.response.status = 404
		ctx.response.body = { error: "Not Found" }
	})

	const port = 8000
	console.log(`Starting server on port ${port}`)

	await app.listen({ port })
}

if (import.meta.main) {
	main()
}

