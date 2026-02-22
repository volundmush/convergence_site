import { Application, Router, send } from "jsr:@oak/oak@17.1.6"
import Handlebars from "npm:handlebars@^4.7.8"
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts"

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

	var pageTemplate = Handlebars.compile(pageContent)
	var renderedPage = pageTemplate({ ...data, page })

	// Inject the rendered page into the layout
	return siteTemplate({ ...data, page, body: renderedPage })
}

async function main() {
	const siteTemplate = await initializeHandlebars()

	const app = new Application()
	const router = new Router()

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

	router.get("/", async (ctx) => {
		ctx.response.status = 301
		ctx.response.headers.set("Location", "/static/")
		ctx.response.body = "Found"
	})

	router.get("/api/logs/get/:key", async (ctx) => {
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

	router.get("/api/characters/get/", async (ctx) => {
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

	router.get("/api/characters/get/:key", async (ctx) => {
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

	router.post("/api/characters/edit/", async (ctx) => {
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

	router.post("/api/logs/list/", async (ctx) => {
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
      a.actor_type
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

	router.get("/api/logs/player/:objid", async (ctx) => {
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

	router.post("/api/logs/pagecount/", async (ctx) => {
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

	router.post("/api/logs/upcoming/", async (ctx) => {
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
LEFT JOIN entity e ON e.entity_id = s.scene_creator_id
WHERE s.scene_status = 0 AND s.scene_date_scheduled > NOW()
ORDER BY s.scene_date_scheduled ASC
LIMIT ?, 50
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

	router.get("/logs/:key/", async (ctx) => {
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

	// Trailing slash redirect middleware (runs before 404 handler)
	app.use(async (ctx, next) => {
		// Only process GET requests
		if (ctx.request.method === "GET") {
			const url = ctx.request.url.pathname

			// Check if URL doesn't end with slash and doesn't have a file extension
			if (!url.endsWith("/") && !url.includes(".")) {
				// Try to find a route with trailing slash
				const routeWithSlash = url + "/"

				// Check if this route exists in our trailing slash routes
				const trailingSlashRoutes = pageRoutes.map(route => route.path)
				const routeExists = trailingSlashRoutes.includes(routeWithSlash)

				if (routeExists) {
					// Redirect to the route with trailing slash
					ctx.response.status = 302
					ctx.response.headers.set("Location", routeWithSlash)
					return
				}
			}
		}

		// Continue to next middleware
		await next()
	})

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

