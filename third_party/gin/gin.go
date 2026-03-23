package gin

import (
	"encoding/json"
	"net/http"
	"os"
	"path"
	"strings"
)

type H map[string]any

type HandlerFunc func(*Context)

type Engine struct {
	routes   []route
	noRoute  []HandlerFunc
	handlers []HandlerFunc
}

type RouterGroup struct {
	engine   *Engine
	prefix   string
	handlers []HandlerFunc
}

type Context struct {
	Request  *http.Request
	Writer   http.ResponseWriter
	params   map[string]string
	handlers []HandlerFunc
	index    int
	aborted  bool
}

type route struct {
	method   string
	pattern  string
	handlers []HandlerFunc
	match    func(*http.Request) (map[string]string, bool)
}

func Default() *Engine {
	return &Engine{}
}

func (e *Engine) Group(prefix string) *RouterGroup {
	return &RouterGroup{
		engine:   e,
		prefix:   normalizePath(prefix),
		handlers: append([]HandlerFunc(nil), e.handlers...),
	}
}

func (e *Engine) Use(handlers ...HandlerFunc) {
	e.handlers = append(e.handlers, handlers...)
}

func (e *Engine) GET(path string, handlers ...HandlerFunc) {
	e.handle(http.MethodGet, path, handlers...)
}

func (e *Engine) POST(path string, handlers ...HandlerFunc) {
	e.handle(http.MethodPost, path, handlers...)
}

func (e *Engine) PUT(path string, handlers ...HandlerFunc) {
	e.handle(http.MethodPut, path, handlers...)
}

func (e *Engine) DELETE(path string, handlers ...HandlerFunc) {
	e.handle(http.MethodDelete, path, handlers...)
}

func (e *Engine) Static(prefix, root string) {
	prefix = normalizePath(prefix)
	fileServer := http.StripPrefix(prefix, http.FileServer(http.Dir(root)))

	e.routes = append(e.routes, route{
		method:  http.MethodGet,
		pattern: prefix,
		handlers: []HandlerFunc{func(c *Context) {
			if c.Request.URL.Path == prefix {
				c.Request.URL.Path = "/"
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
		}},
		match: func(r *http.Request) (map[string]string, bool) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				return nil, false
			}
			return nil, r.URL.Path == prefix || strings.HasPrefix(r.URL.Path, prefix+"/")
		},
	})
}

func (e *Engine) StaticFile(routePath, filePath string) {
	routePath = normalizePath(routePath)

	e.routes = append(e.routes, route{
		method:  http.MethodGet,
		pattern: routePath,
		handlers: []HandlerFunc{func(c *Context) {
			http.ServeFile(c.Writer, c.Request, filePath)
		}},
		match: func(r *http.Request) (map[string]string, bool) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				return nil, false
			}
			return nil, r.URL.Path == routePath
		},
	})
}

func (e *Engine) NoRoute(handlers ...HandlerFunc) {
	e.noRoute = append([]HandlerFunc(nil), handlers...)
}

func (e *Engine) Run(addr string) error {
	return http.ListenAndServe(addr, e)
}

func (e *Engine) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for _, route := range e.routes {
		params, ok := route.match(r)
		if !ok {
			continue
		}

		context := &Context{
			Request:  r,
			Writer:   w,
			params:   params,
			handlers: route.handlers,
			index:    -1,
		}
		context.Next()
		return
	}

	if len(e.noRoute) > 0 {
		context := &Context{
			Request:  r,
			Writer:   w,
			params:   map[string]string{},
			handlers: e.noRoute,
			index:    -1,
		}
		context.Next()
		return
	}

	http.NotFound(w, r)
}

func (e *Engine) handle(method, routePath string, handlers ...HandlerFunc) {
	combined := append([]HandlerFunc(nil), e.handlers...)
	combined = append(combined, handlers...)
	e.routes = append(e.routes, route{
		method:   method,
		pattern:  normalizePath(routePath),
		handlers: combined,
		match:    patternMatcher(method, normalizePath(routePath)),
	})
}

func (g *RouterGroup) Group(prefix string) *RouterGroup {
	return &RouterGroup{
		engine:   g.engine,
		prefix:   joinPaths(g.prefix, prefix),
		handlers: append([]HandlerFunc(nil), g.handlers...),
	}
}

func (g *RouterGroup) Use(handlers ...HandlerFunc) {
	g.handlers = append(g.handlers, handlers...)
}

func (g *RouterGroup) GET(routePath string, handlers ...HandlerFunc) {
	g.handle(http.MethodGet, routePath, handlers...)
}

func (g *RouterGroup) POST(routePath string, handlers ...HandlerFunc) {
	g.handle(http.MethodPost, routePath, handlers...)
}

func (g *RouterGroup) PUT(routePath string, handlers ...HandlerFunc) {
	g.handle(http.MethodPut, routePath, handlers...)
}

func (g *RouterGroup) DELETE(routePath string, handlers ...HandlerFunc) {
	g.handle(http.MethodDelete, routePath, handlers...)
}

func (g *RouterGroup) handle(method, routePath string, handlers ...HandlerFunc) {
	fullPath := joinPaths(g.prefix, routePath)
	combined := append([]HandlerFunc(nil), g.handlers...)
	combined = append(combined, handlers...)
	g.engine.routes = append(g.engine.routes, route{
		method:   method,
		pattern:  fullPath,
		handlers: combined,
		match:    patternMatcher(method, fullPath),
	})
}

func (c *Context) Next() {
	c.index++
	for c.index < len(c.handlers) {
		c.handlers[c.index](c)
		if c.aborted {
			return
		}
		c.index++
	}
}

func (c *Context) Abort() {
	c.aborted = true
}

func (c *Context) AbortWithStatusJSON(status int, body any) {
	c.aborted = true
	c.JSON(status, body)
}

func (c *Context) JSON(status int, body any) {
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(status)
	_ = json.NewEncoder(c.Writer).Encode(body)
}

func (c *Context) ShouldBindJSON(target any) error {
	defer c.Request.Body.Close()
	decoder := json.NewDecoder(c.Request.Body)
	return decoder.Decode(target)
}

func (c *Context) Status(status int) {
	c.Writer.WriteHeader(status)
}

func (c *Context) Param(name string) string {
	return c.params[name]
}

func (c *Context) GetHeader(key string) string {
	return c.Request.Header.Get(key)
}

func (c *Context) File(filePath string) {
	http.ServeFile(c.Writer, c.Request, filePath)
}

func patternMatcher(method, pattern string) func(*http.Request) (map[string]string, bool) {
	return func(r *http.Request) (map[string]string, bool) {
		if r.Method != method {
			return nil, false
		}

		patternSegments := splitPath(pattern)
		requestSegments := splitPath(r.URL.Path)
		if len(patternSegments) != len(requestSegments) {
			return nil, false
		}

		params := make(map[string]string)
		for i := range patternSegments {
			if strings.HasPrefix(patternSegments[i], ":") {
				params[strings.TrimPrefix(patternSegments[i], ":")] = requestSegments[i]
				continue
			}
			if patternSegments[i] != requestSegments[i] {
				return nil, false
			}
		}

		return params, true
	}
}

func splitPath(routePath string) []string {
	routePath = normalizePath(routePath)
	if routePath == "/" {
		return nil
	}
	return strings.Split(strings.Trim(routePath, "/"), "/")
}

func joinPaths(base, next string) string {
	return normalizePath(path.Join(base, next))
}

func normalizePath(value string) string {
	if value == "" {
		return "/"
	}

	clean := path.Clean("/" + value)
	if clean == "." {
		return "/"
	}
	return clean
}

func Dir(root string, _ bool) http.FileSystem {
	return http.Dir(root)
}

func init() {
	_ = os.Setenv("GIN_MODE", "release")
}
