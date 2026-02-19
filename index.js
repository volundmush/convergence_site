import { Application, Router, send } from "jsr:@oak/oak@17.1.6"
import Handlebars from "npm:handlebars@^4.7.8"

const rhost = Deno.env.get("RHOST_ENDPOINT") || "http://%2322222umicupcake@127.0.0.1:2061/"
const SERVER_START_TIME = Date.now()


function escapeInput(str) {
	return str.replaceAll(/ /g, '%b').replaceAll(/\n/g,'%r').replaceAll(/\}/g,'%}').replaceAll(/\{/g,'%{').replaceAll(/\[/g,'\\[').replaceAll(/;/g,'%;').replaceAll(/["]/g,'\\"').replaceAll(/\{\}/g,'')
}

async function rhostExec(exec) {
	try {
		const response = await fetch(rhost, {
			headers: {
				parse: 'ansiparse',
				encode: 'yes',
				exec64: btoa(exec)
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
				"x-lua64": btoa(exec)
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

	router.get("/logs/:key/", async (ctx) => {
		try {
			const characterKey = ctx.params.key
			const characterDoc = await character.findCharacterByKey(characterKey)
			
			if (!characterDoc) {
				ctx.response.status = 404
				ctx.response.body = { error: "Character not found" }
				return
			}
			
			ctx.response.body = { character: characterDoc }
		} catch (error) {
			await logError(error, "Get admin character by key")
			ctx.response.status = 500
			ctx.response.body = { error: "Failed to get character" }
		}
	})

	router.get("/api/characters/get/", async (ctx) => {
		const luaScript = `
ret = {}
playersRaw = rhost.strfunc("search", "type=player")
for dbref in string.gmatch(playersRaw, "([^%s]+)") do
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

			const triggerInfo = async (type, val) {
				return await rhostLua(`rhost.strfunc("eval", `[trigger(#lambda/{@sudo ${checkLogin.characterRef}=+info ${type}=${escapeInput(val)}})]"); return "{}"`)
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

	// Centralized route configuration
	const pageRoutes = [
		{ path: "/characters/", template: "/app/templates/pages/characters/index.hbs", errorContext: "Characters list page render" },
		{ path: "/logs/", template: "/app/templates/pages/logs/index.hbs", errorContext: "Logs list page render" },
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

