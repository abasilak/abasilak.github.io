"use strict";

var gl;
var WebGLViewer;
if (!WebGLViewer) WebGLViewer = (typeof WebGLViewer !== 'undefined' ? WebGLViewer : null) || {};

//
// Initialize the GL context
//
function webgl_viewer_context_init(xr)
{
  /* Canvas CSS dimension differ from WebGL viewport dimensions so we
   * make them match here
   * @see https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
   */
  WebGLViewer.canvas          = document.getElementById('webrays-main-canvas');
  WebGLViewer.canvas.width    = WebGLViewer.canvas.clientWidth;
  WebGLViewer.canvas.height   = WebGLViewer.canvas.clientHeight;
  WebGLViewer.webgl_context_attribs = { 'majorVersion' : 2, 'minorVersion' : 0 };

  /* @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext */
  WebGLViewer.gl = gl         = WebGLViewer.canvas.getContext("webgl2", {
    stencil:               false,
    alpha:                 false,
    antialias:             false,
    premultipliedAlpha:    false,
    preserveDrawingBuffer: false,
    depth:                 false,
    xrCompatible:          xr
  });

  // If we don't have a GL context, give up now
  // Only continue if WebGL is available and working
  if (!gl) {
    throw ("Unable to initialize WebGL 2. Your browser or machine may not support it.");
  }

  var gl_ext_color_buffer_float = gl.getExtension('Ext_color_buffer_float');
  if (!gl_ext_color_buffer_float) {
    throw ("Unable to initialize WebGL ext: Ext_color_buffer_float.");
  }

  var gl_ext_float_blend = gl.getExtension('Ext_float_blend');
  if (!gl_ext_float_blend) {
    throw ("Unable to initialize WebGL ext: Ext_float_blend.");
  }
}

//
// Create webgl context
//
function webgl_viewer_context_create()
{
  GL.makeContextCurrent(GL.createContext(WebGLViewer.canvas, WebGLViewer.webgl_context_attribs));
}

//
// Initialize the VAO we'll need for the sceen quad rendering
//
function webgl_viewer_vao_init()
{ 
  const screen_fill_triangle = new Float32Array(
  [ -1.0, -1.0, 0.0, 
     8.0, -1.0, 0.0, 
    -1.0,  8.0, 0.0]
  );

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, screen_fill_triangle, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  WebGLViewer.vao = gl.createVertexArray();
  gl.bindVertexArray(WebGLViewer.vao);
  {
    gl.bindBuffer             (gl.ARRAY_BUFFER, vbo);
    gl.vertexAttribPointer    (0, 3, gl.FLOAT, false, 0, 0); 
    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }
  gl.bindVertexArray(null);
  
  webgl_utils_error();
}

//
// Initialize the framebuffers we'll need for the rendering
//
function webgl_viewer_fbo_init()
{
  // Delete previous state
  if(WebGLViewer.framebuffer !== undefined) {
    gl.deleteTexture(WebGLViewer.framebuffer.rt_accum_texture);
    gl.deleteFramebuffer(WebGLViewer.framebuffer.rt_fbo);
  }

  WebGLViewer.framebuffer = {
    rt_fbo:             gl.createFramebuffer(),
    rt_accum_texture:   webgl_utils_texture_2d_alloc(gl.RGBA32F, WebGLViewer.canvas.width, WebGLViewer.canvas.height),
  };  

  gl.bindFramebuffer(gl.FRAMEBUFFER, WebGLViewer.framebuffer.rt_fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, WebGLViewer.framebuffer.rt_accum_texture , 0);
  webgl_utils_fbo_error();

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

//
// Copy framebuffer to the screen
//
function webgl_viewer_fbo_blit(read_fbo)
{
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read_fbo);
  gl.readBuffer     (gl.COLOR_ATTACHMENT0);
  gl.drawBuffers    ([gl.BACK]);

  var dst_viewport = [ 0, 0, WebGLViewer.canvas.width, WebGLViewer.canvas.height];
  var src_viewport = [ 0, 0, WebGLViewer.canvas.width, WebGLViewer.canvas.height];

  gl.blitFramebuffer(
    src_viewport[0], src_viewport[1], src_viewport[2], src_viewport[3],
    dst_viewport[0], dst_viewport[1], dst_viewport[2], dst_viewport[3],
    gl.COLOR_BUFFER_BIT, gl.NEAREST);
}

//
// Resize Canvas
//
function webgl_viewer_resize()
{
    WebGLViewer.camera.set_size(gl.canvas.clientWidth, gl.canvas.clientHeight);

    webgl_viewer_fbo_init();
}