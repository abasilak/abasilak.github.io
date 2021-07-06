"use strict";

WebRaysModule['onRuntimeInitialized'] = rt_main;

// ---- XR ----

import {WebXRButton} from './util/webxr-button.js';

let xrButton            = null;
let xrImmersiveRefSpace = null;
let xrInlineRefSpace    = null;

function xr_onRequestSession() {
    return navigator.xr.requestSession('immersive-vr').then((session) => {
      xrButton.setSession(session);
      // Set a flag on the session so we can differentiate it from the inline session.
      session.isImmersive = true;
      xr_onSessionStarted(session);
    });
}

function xr_onEndSession(session) {
    session.end();
}

function xr_onSessionStarted(session) {
    session.addEventListener('end', xr_onSessionEnded);

    webgl_viewer_context_init(true);
    webrays_module_init(WebGLViewer.context); // [WR]     1. Initialization
    webgl_viewer_context_create();
    webrays_get_instance();                   // [WR]     2. Get WR instance

    rt_init(session);
}

function xr_onSessionEnded(event) {
    // Only reset the button when the immersive session ends.
    if (event.session.isImmersive) {
      xrButton.setSession(null);
    }
}

function xr_init() {
    xrButton = new WebXRButton({
      onRequestSession: xr_onRequestSession,
      onEndSession:     xr_onEndSession,
    });
    document.querySelector('header').appendChild(xrButton.domElement);

    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
        xrButton.enabled = supported;
      });

      // Start up an inline session, which should always be supported on
      // browsers that support WebXR regardless of the available hardware.
      navigator.xr.requestSession('inline').then((session) => {
        xr_onSessionStarted(session);
      });
    }
}

function rt_main()
{
    xr_init();
}

let ads_index = 0;

function rt_init(session)
{
    // Camera
    WebGLViewer.camera          = new SimplePerspectiveCamera(WebGLViewer.canvas); 

    // Shader
    WebGLViewer.rt_shader    = {
      vertex_source:   `#version 300 es
                        precision highp float;
                        layout(location = 0) in vec3 vertex_position;
                        void main() {
                          gl_Position = vec4(vertex_position, 1.0f);
                        }`,
      fragment_source: `precision highp int;
                        precision highp float;
      
                        #define FLT_MAX   1.e27
      
                        uniform int       ads_index; 
                        uniform ivec2     dimensions;

                        uniform mat4      projectionInvMatrix;
                        uniform mat4      viewInvMatrix;

                        layout(location = 0) out vec4 rt_accumulation_OUT;
                        
                        void main()
                        {
                            // A. Generate Primary Rays                        
                            vec2 pixel          =  gl_FragCoord.xy;
                            vec2 pixel_norm     = pixel / vec2(dimensions);
                          
                            vec4 pndc = vec4(2.0 * pixel_norm - 1.0, 0.0, 1.0);
                            vec4 pecs = projectionInvMatrix * pndc;
                            pecs /= pecs.w;
                            
                            vec4 direction_ecs = normalize(vec4(pecs.xyz, 0.0));
                            vec3 ray_origin    = vec3(viewInvMatrix * vec4(pecs.xyz, 1.0));
                            vec3 ray_direction = normalize(vec3(viewInvMatrix * direction_ecs));

                            // B. Perform Ray Intersection Tests
                            ivec4 ray_intersection = wr_query_intersection(ads_index, ray_origin, ray_direction, FLT_MAX);
                        
                            // C. Compute Color
                            vec3  ray_color; 
                            // C.1. Miss stage
                            if (ray_intersection.x < 0) {
                              ray_color = vec3(0.0); // Black background
                            }
                            // C.2. Hit stage
                            else {
                              // Visualize using the barycentric coordinates of the intersection
                              ray_color.xy = wr_GetBaryCoords(ray_intersection);
                              ray_color.z  = 1.0 - ray_color.x - ray_color.y;
                            }
                            rt_accumulation_OUT = vec4(ray_color, 1.0);
                        }`,
      program:         null
    }

    // Mesh containg one Triangle
    WebGLViewer.mesh = {
      vertex_data:    new Float32Array ([-1, -1, -1,      // 1
                                          1, -1, -1,      // 2
                                          0,  1, -1]),    // 3
      vertex_size:    3,
      normal_data:    new Float32Array ([0, 0, 1,         // 1
                                         0, 0, 1,         // 2
                                         0, 0, 1]),       // 3
      normal_size:    3,
      uv_data:        new Float32Array ([0, 0,            // 1
                                         1, 0,            // 2
                                         1, 1,]),         // 3
      uv_size:        2,
      face_data:      new Int32Array   ([0, 1, 2,         // 1 indices
                                               0,])       // 1 info
    }
    
    webgl_viewer_vao_init();
    webgl_viewer_resize();
    ads_index = webrays_ads_init(WebGLViewer.mesh);       // [WR]     3. ADS setup

    gl.disable(gl.DEPTH_TEST); 
    gl.depthMask(false);

// [XR]

    // WebGL layers for inline sessions won't allocate their own framebuffer,
    // which causes gl commands to naturally execute against the default
    // framebuffer while still using the canvas dimensions to compute
    // viewports and projection matrices.
    let glLayer = new XRWebGLLayer(session, gl);

    session.updateRenderState({
      baseLayer: glLayer
    });

    let refSpaceType = session.isImmersive ? 'local' : 'viewer';
    session.requestReferenceSpace(refSpaceType).then((refSpace) => {
      // Since we're dealing with multiple sessions now we need to track
      // which XRReferenceSpace is associated with which XRSession.
      if (session.isImmersive) {
          xrImmersiveRefSpace = refSpace;
      } else {
          xrInlineRefSpace    = refSpace;
      }
      session.requestAnimationFrame(rt_render);
    });
}

// Inline view adjustment code
// Allow the user to click and drag the mouse (or touch and drag the
// screen on handheld devices) to adjust the viewer pose for inline
// sessions. Samples after this one will hide this logic with a utility
// class (InlineViewerHelper).
let lookYaw = 0;
let lookPitch = 0;

// XRReferenceSpace offset is immutable, so return a new reference space
// that has an updated orientation.
function getAdjustedRefSpace(refSpace) {
    // Represent the rotational component of the reference space as a
    // quaternion.
    let invOrientation = glMatrix.quat.create();
    glMatrix.quat.rotateX(invOrientation, invOrientation, -lookPitch);
    glMatrix.quat.rotateY(invOrientation, invOrientation, -lookYaw);
    let xform = new XRRigidTransform(
        {x: 0, y: 0, z: 0},
        {x: invOrientation[0], y: invOrientation[1], z: invOrientation[2], w: invOrientation[3]});
    return refSpace.getOffsetReferenceSpace(xform);
}

//
// Render function
//
function rt_render(t, frame)
{
    let session  = frame.session;
    // Ensure that we're using the right frame of reference for the session.
    let refSpace = session.isImmersive ? xrImmersiveRefSpace : xrInlineRefSpace;

    // Account for the click-and-drag mouse movement or touch movement when
    // calculating the viewer pose for inline sessions.
    if (!session.isImmersive) {
      refSpace = getAdjustedRefSpace(refSpace);
    }

    let pose = frame.getViewerPose(refSpace);

    session.requestAnimationFrame(rt_render);

    rt_update();

    rt_draw(session, pose);
}

//
// Update function
//
function rt_update()
{
    let wr_fragment_source = webrays_get_shader_source();     // [WR] 4. Get generated WR shader source
    if (wr_fragment_source !== null)
    {
      let vertex_shader             = webgl_utils_compile_shader(WebGLViewer.rt_shader.vertex_source, gl.VERTEX_SHADER);
      let fragment_source           = '#version 300 es\n' + wr_fragment_source + WebGLViewer.rt_shader.fragment_source;
      let fragment_shader           = webgl_utils_compile_shader(fragment_source, gl.FRAGMENT_SHADER);
      WebGLViewer.rt_shader.program = webgl_utils_create_program(vertex_shader  , fragment_shader);
    }
}

//
// Draw function
//
function rt_draw(session, pose) 
{
    let glLayer = session.renderState.baseLayer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(WebGLViewer.rt_shader.program);

    let index;
    index = gl.getUniformLocation(WebGLViewer.rt_shader.program, "ads_index");
    gl.uniform1i(index, ads_index);

    let next_texture_unit = webrays_bindings(WebGLViewer.rt_shader.program, 0); // [WR] 5. ADS shader bindings

    for (let view of pose.views) {
      
      // Viewport
      let viewport = glLayer.getViewport(view);
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      
      // Projection Matrix
      var projectionInvMatrix = glMatrix.mat4.create();
      glMatrix.mat4.invert(projectionInvMatrix, view.projectionMatrix);

      // View Matrix
      var viewInvMatrix = glMatrix.mat4.create();
      glMatrix.mat4.mul(viewInvMatrix, viewInvMatrix, WebGLViewer.camera.view);
      glMatrix.mat4.invert(viewInvMatrix, view.transform);

      // Camera
      index = gl.getUniformLocation(WebGLViewer.rt_shader.program, "projectionInvMatrix");
      gl.uniformMatrix4fv(index, false, projectionInvMatrix);
      index = gl.getUniformLocation(WebGLViewer.rt_shader.program, "viewInvMatrix");
      gl.uniformMatrix4fv(index, false, viewInvMatrix);
      index = gl.getUniformLocation(WebGLViewer.rt_shader.program, "dimensions");
      gl.uniform2iv(index, [viewport.width, viewport.height]);

      // Full-sceen rendering pass
      gl.bindVertexArray(WebGLViewer.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);  
    }
    
    while(next_texture_unit >= 0)
    {
      gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);

      next_texture_unit = next_texture_unit - 1;
    }

    gl.useProgram(null);
}

