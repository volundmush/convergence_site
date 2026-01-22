import { Application, Router, send } from "jsr:@oak/oak@17.1.6"
import Handlebars from "npm:handlebars@^4.7.8"

const rhost = Deno.env.get("RHOST_ENDPOINT") || "http://%2322222umicupcake@127.0.0.1:2061/"

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
		
		return Buffer.from(response.headers.get('return'), 'base64').toString('utf8')
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
			console.log('[rhostExec] ERROR', e)
			return {
				error: `${e}`
			}
		} else {
			// console.log('[rhostLua] CONNRESET, retrying')
			return this.rhostLua(exec)
		}
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

	router.get("/characters/get/", async (ctx) => {
		const luaScript = `
ret = {}
playersRaw = rhost.strfunc("search", "type=player")
for dbref in string.gmatch(playersRaw, "([^%s]+)") do
	pc = rhost.strfunc("eval", "[hastotem(" .. dbref .. ",PC)]")
	character = rhost.strfunc("eval", "[hastotem(" .. dbref .. ",CHARACTER)]")
	if character == "1" then
		char = {}
		char.name = rhost.strfunc("name", dbref)
		char.cname = rhost.strfunc("cname", dbref)
		char.dbref = dbref
		char.pc = pc == "1"
		table.insert(ret, char)
	end
end
return json.encode(ret)
`
		var ret = []
		try {
			ret = await rhostLua(luaScript)
		} catch(e) {
			console.log("[/characters/get/] error:", e)
			ret = []
		}

		ctx.response.status = 200
		ctx.response.body = ret
	})

	router.get("/characters/:key/", async (ctx) => {
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

