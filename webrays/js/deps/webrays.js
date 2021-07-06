var WebRaysModule;
if (!WebRaysModule) WebRaysModule = (typeof WebRaysModule !== 'undefined' ? WebRaysModule : null) || {};

WebRaysModule.print = function(text) { 
	console.log(text);
};

/* Override for correct use in Electron APPs */
WebRaysModule.locateFile = function(path,scriptDirectory) {
  return "js/deps/"+path;
};

function wrays_pointer_word_size() { 
  return 1;
}
function wrays_free(addr) { 
  return WebRaysModule._free(addr);
}

function wrays_alloc_ints(count) { 
  return WebRaysModule._malloc(Int32Array.BYTES_PER_ELEMENT * count);
}
function wrays_create_ints(addr, count) { 
  var int_heap = new Int32Array(WebRaysModule.HEAPU8.buffer, addr, count);
  return int_heap;
}
function wrays_alloc_int() { 
  return WebRaysModule._malloc(Int32Array.BYTES_PER_ELEMENT);
}
function wrays_create_int(addr) { 
  var int_heap = new Int32Array(WebRaysModule.HEAPU8.buffer, addr, Int32Array.BYTES_PER_ELEMENT);
  return int_heap[0];
}

function wrays_alloc_uints(count) { 
  return WebRaysModule._malloc(Uint32Array.BYTES_PER_ELEMENT * count);
}
function wrays_create_uints(addr, count) { 
  var int_heap = new Uint32Array(WebRaysModule.HEAPU8.buffer, addr, Uint32Array.BYTES_PER_ELEMENT * count);
  return int_heap;
}
function wrays_alloc_uint() { 
  return WebRaysModule._malloc(Uint32Array.BYTES_PER_ELEMENT);
}
function wrays_create_uint(addr) { 
  var uint_heap = new Uint32Array(WebRaysModule.HEAPU8.buffer, addr, Uint32Array.BYTES_PER_ELEMENT);
  return uint_heap[0];
}

function wrays_create_string(addr, max_count) { 
  return UTF8ToString(addr, max_count);
}
function wrays_string_to_heap(cseq){
  const numBytes = lengthBytesUTF8(cseq) + 1;
  const ptr = Module._malloc(numBytes);

  stringToUTF8(cseq, ptr, numBytes);

  return ptr;
}
function wrays_array_to_heap(typedArray){
  const numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
  const ptr = Module._malloc(numBytes);
  const heapBytes = new Uint8Array(Module.HEAPU8.buffer, ptr, numBytes);
  heapBytes.set(new Uint8Array(typedArray.buffer));
  return ptr;
}
function wrays_count_options(options) {
  return Object.keys(options).length;
}
function wrays_flatten_options(options) {
  const options_flat = Object.keys(options).reduce(function (r, k) {
    return r.concat(k, String(options[k]));
  }, []);
  const options_count = options_flat.length / 2;
  const options_byte_count = 2 * options_count * wrays_pointer_word_size() * Uint32Array.BYTES_PER_ELEMENT;
  const options_pairs = new Uint32Array(options_count * 2);
  for (var i = 0; i < options_count * 2; i+=2) {
    options_pairs[i + 0] = wrays_string_to_heap(options_flat[i + 0]);
    options_pairs[i + 1] = wrays_string_to_heap(options_flat[i + 1]);
  }
  
  return wrays_array_to_heap(options_pairs);
}

function wrays_free_options(options_pair_ptr, options_count) {
  const options_pairs = wrays_create_uints(options_pair_ptr, options_count);
  for (var i = 0; i < options_count * 2; i++) {
    wrays_free(options_pairs[i]);
  }
  wrays_free(options_pair_ptr);
}

var WebRays = {

  BackendType: { NONE: 0, GLES: 1, GL: 2, VULKAN: 3, WEBGPU: 4, CPU: 5, MAX: 6 },

  WebGLIntersectionEngine: function (gl) {
    var major_ptr = wrays_alloc_int();
    var minor_ptr = wrays_alloc_int();

    WebRaysModule['_wrays_version'](major_ptr, minor_ptr);

    this.GLContextAttribs = { 'majorVersion' : 2, 'minorVersion' : 0 };
    this.GL = GL;
    this.GLCanvas = gl.canvas;
    this.GLContext = GL.createContext(gl.canvas, this.GLContextAttribs);
    this.GL.makeContextCurrent(this.GLContext);
    
    this.Backend = WebRays.BackendType.GLES;
    this.BackendDescription = "WebGL 2";
    this.Version = {};
    this.Version.major = wrays_create_int(major_ptr);
    this.Version.minor = wrays_create_int(minor_ptr);

    wrays_free(major_ptr);
    wrays_free(minor_ptr);

    this.Version.description = wrays_create_string(WebRaysModule['_wrays_version_string'](), 256);

    this.VAO = gl.createVertexArray();
    gl.bindVertexArray(this.VAO);
    var screen_fill_triangle = new Float32Array(
                            [ -4.0, -4.0, 0.0,
                               4.0, -4.0, 0.0, 
                               0.0, 4.0, 0.0 ]
                            );
    
    this.VBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.VBO);
    gl.bufferData(gl.ARRAY_BUFFER, screen_fill_triangle, gl.STATIC_DRAW);  
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); 

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    /* Get callbacks to native functions */
    this.Context = WebRaysModule['_wrays_init'](1);
    this.IsectProgram = null;
    this.OcclusionProgram = null;
    this.OcclusionBuffers = [];
    this.IsectBuffers = [];
    this.Bindings = [];
    this.BindingPtr = wrays_alloc_int(5);
    this.BufferInfoPtr = wrays_alloc_int(5);
    this.DimensionsPtr = wrays_alloc_uint(16);
    this.RayBufferRequirements = this.RayOriginBufferRequirements = this.RayDirectionBufferRequirements = function(dims) {
      var buffer_info = {};
      if (!Array.isArray(dims))
        return buffer_info;

      if (dims.length == 2) {
        var dims_ptr = wrays_array_to_heap(new Uint32Array([dims[0], dims[1]]));
        WebRaysModule['_wrays_ray_buffer_requirements'](this.Context, this.BufferInfoPtr, dims_ptr, 2);
        var buffer_info_ints = wrays_create_ints(this.BufferInfoPtr, 5);
        wrays_free(dims_ptr);

        var type = buffer_info_ints[0];
        if(2 == type) {
          buffer_info = {
            Type : buffer_info_ints[0],
            Target : buffer_info_ints[1],
            InternalFormat : buffer_info_ints[2],
            Width : buffer_info_ints[3],
            Height : buffer_info_ints[4]
          };
        } else {

        }
      } else if (dims.length == 1) {
        var count = dims[0];
      }
      
      return buffer_info;
    };

    this.IntersectionBufferRequirements = function(dims) {
      var buffer_info = {};
      if (!Array.isArray(dims))
        return buffer_info;

      if (dims.length == 2) {
        var dims_ptr = wrays_array_to_heap(new Uint32Array([dims[0], dims[1]]));
        WebRaysModule['_wrays_intersection_buffer_requirements'](this.Context, this.BufferInfoPtr, dims_ptr, 2);
        var buffer_info_ints = wrays_create_ints(this.BufferInfoPtr, 5);
        wrays_free(dims_ptr);
        
        var type = buffer_info_ints[0];
        if(2 == type) {
          buffer_info = {
            Type : buffer_info_ints[0],
            Target : buffer_info_ints[1],
            InternalFormat : buffer_info_ints[2],
            Width : buffer_info_ints[3],
            Height : buffer_info_ints[4]
          };
        } else {

        }
      } else if (dims.length == 1) {
        var count = dims[0];
      }
      
      return buffer_info;
    };
    this.OcclusionBufferRequirements = function(dims) {
      var buffer_info = {};
      if (!Array.isArray(dims))
        return buffer_info;

      if (dims.length == 2) {
        var dims_ptr = wrays_array_to_heap(new Uint32Array([dims[0], dims[1]]));
        WebRaysModule['_wrays_occlusion_buffer_requirements'](this.Context, this.BufferInfoPtr, dims_ptr, 2);
        var buffer_info_ints = wrays_create_ints(this.BufferInfoPtr, 5);
        wrays_free(dims_ptr);
        
        var type = buffer_info_ints[0];
        if(2 == type) {
          buffer_info = {
            Type : buffer_info_ints[0],
            Target : buffer_info_ints[1],
            InternalFormat : buffer_info_ints[2],
            Width : buffer_info_ints[3],
            Height : buffer_info_ints[4]
          };
        } else {

        }
      } else if (dims.length == 1) {
        var count = dims[0];
      }
      
      return buffer_info;
    };
    this.GetSceneAccessorString = function() {
      var accessor_ptr = WebRaysModule['_wrays_get_scene_accessor'](this.Context);
      return wrays_create_string(accessor_ptr, 100000);
    };
    this.GetSceneAccessorBindings = function() {
      var int_count = wrays_pointer_word_size() + 1 + wrays_pointer_word_size() + 1;
      var byte_count = int_count * 4;
      var binding_count_ptr = wrays_alloc_int();
      var bindings_ptr = WebRaysModule['_wrays_get_scene_accessor_bindings'](this.Context, binding_count_ptr);
      var bindings = [];

      var binding_count = wrays_create_int(binding_count_ptr);
      for (var binding_index = 0; binding_index < binding_count; ++binding_index) {
        var bindings_ints = wrays_create_ints(bindings_ptr + byte_count * binding_index, int_count);
        var binding_type = bindings_ints[1];
        var binding = {};
        if (binding_type == 1) {
          binding = {
            Name : wrays_create_string(bindings_ints[0], 256),
            Type : binding_type,
            UBO  : GL.buffers[bindings_ints[2]]
          };
        } else if (binding_type == 2) {
          binding = {
            Name : wrays_create_string(bindings_ints[0], 256),
            Type : binding_type,
            Texture  : GL.textures[bindings_ints[2]]
          };
        } else if (binding_type == 3) {
          binding = {
            Name : wrays_create_string(bindings_ints[0], 256),
            Type : binding_type,
            Texture  : GL.textures[bindings_ints[2]]
          };
        }

        bindings.push(binding);
      }
      wrays_free(binding_count_ptr);

      return bindings;
    };
    this.Update = function() {
      var update_flags_ptr = wrays_alloc_int();
      var error = WebRaysModule['_wrays_update'](this.Context, update_flags_ptr);
      var update_flags = wrays_create_int(update_flags_ptr);
      
      wrays_free(update_flags_ptr);
      if (0 == update_flags)
        return update_flags;

      var isect_program_ptr = wrays_alloc_uint();
      var occlusion_program_ptr = wrays_alloc_uint();
     
      WebRaysModule['__wrays_internal_get_intersection_kernel'](this.Context, isect_program_ptr);
      WebRaysModule['__wrays_internal_get_occlusion_kernel'](this.Context, occlusion_program_ptr);
     
      var isect_program = wrays_create_uint(isect_program_ptr);
      var occlusion_program = wrays_create_uint(occlusion_program_ptr);
      
      this.IsectProgram = GL.programs[isect_program];
      this.OcclusionProgram = GL.programs[occlusion_program];
      //console.log(this.IsectProgram);
      //console.log(this.OcclusionProgram);
      this.Bindings = this.GetSceneAccessorBindings();
      console.log(this.Bindings);

      wrays_free(isect_program_ptr);
      wrays_free(occlusion_program_ptr);

      return update_flags;
    };
    this.QueryOcclusion = function(ray_buffers,  occlusion_buffer, dims) {
      if (!Array.isArray(dims) || !Array.isArray(ray_buffers))
        return "Wrong argument types";
    
      var gl = GL.currentContext.GLctx;
      var width = 0;
      var height = 0;
      var fbo = null;

      if (occlusion_buffer.hasOwnProperty('WebRaysData')) { 
        fbo = occlusion_buffer.WebRaysData.FBO;
        width = occlusion_buffer.WebRaysData.Width;
        height = occlusion_buffer.WebRaysData.Height;
      }
      if (null == fbo) {
        fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, occlusion_buffer, 0);
        if (gl.FRAMEBUFFER_COMPLETE != gl.checkFramebufferStatus(gl.FRAMEBUFFER)) {
          console.log('Error Creating Occlusion Buffer FBO');
        }
        this.OcclusionBuffers.push({ Handle : occlusion_buffer, FBO : fbo, Width : dims[0], Height : dims[1] });
        occlusion_buffer.WebRaysData = { Handle : occlusion_buffer, FBO : fbo, Width : dims[0], Height : dims[1] };
        width = dims[0];
        height = dims[1];
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

      var current_vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(this.VAO);
	    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, width, height);
      
      gl.useProgram(this.OcclusionProgram);
      var index = gl.getUniformLocation(this.OcclusionProgram, "wr_RayOrigins");
	    gl.activeTexture(gl.TEXTURE0 + 0);
	    gl.bindTexture(gl.TEXTURE_2D, ray_buffers[0]);
	    gl.uniform1i(index, 0);
	    index = gl.getUniformLocation(this.OcclusionProgram, "wr_RayDirections");
	    gl.activeTexture(gl.TEXTURE0 + 1);
	    gl.bindTexture(gl.TEXTURE_2D, ray_buffers[1]);
	    gl.uniform1i(index, 1);
      index = gl.getUniformLocation(this.OcclusionProgram, "wr_ADS");
      gl.uniform1i(index, 0);
      
      var bindings = this.Bindings;
      var next_texture_unit = 2;
      for (var binding_index = 0; binding_index < bindings.length; ++binding_index) {		
        var binding = bindings[binding_index];
    
        /* if UBO */
        if (binding.Type == 1) {
          
        /* if Texture 2D */
        } else if (binding.Type == 2) {
          index = gl.getUniformLocation(this.OcclusionProgram, binding.Name);
          gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
          gl.bindTexture(gl.TEXTURE_2D, binding.Texture);
          gl.uniform1i(index, next_texture_unit);
          next_texture_unit++;
        /* if Texture Array 2D */
        } else if (binding.Type == 3) {
          index = gl.getUniformLocation(this.OcclusionProgram, binding.Name);
          gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, binding.Texture);
          gl.uniform1i(index, next_texture_unit);
          next_texture_unit++;
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      
      /* Rethink */
      gl.bindVertexArray(current_vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    this.QueryIntersection = function(ray_buffers, isect_buffer, dims) {
      if (!Array.isArray(dims) || !Array.isArray(ray_buffers))
        return "Wrong argument types";

      var gl = GL.currentContext.GLctx;
      var width = 0;
      var height = 0;
      var fbo = null;

      /*for (var buffer_index = 0; buffer_index < this.IsectBuffers.length; ++buffer_index) {
        var buffer_2d = this.IsectBuffers[buffer_index];
        if ( buffer_2d.Handle == isect_buffer ) {
          width = buffer_2d.Width;
          height = buffer_2d.Height;
          fbo = buffer_2d.FBO;
          break;
        }
      }*/
      if (isect_buffer.hasOwnProperty('WebRaysData')) { 
        fbo = isect_buffer.WebRaysData.FBO;
        width = isect_buffer.WebRaysData.Width;
        height = isect_buffer.WebRaysData.Height;
      }
      if (null == fbo) {
        fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D( gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, isect_buffer, 0);
        if (gl.FRAMEBUFFER_COMPLETE != gl.checkFramebufferStatus(gl.FRAMEBUFFER)) {
          console.log('Error Creating Intersection Buffer FBO');
        }
        this.IsectBuffers.push({ Handle : isect_buffer, FBO : fbo, Width : dims[0], Height : dims[1] });
        isect_buffer.WebRaysData = { Handle : isect_buffer, FBO : fbo, Width : dims[0], Height : dims[1] };
        width = dims[0];
        height = dims[1];
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

      var current_vao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      gl.bindVertexArray(this.VAO);
	    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, width, height);
      
      gl.useProgram(this.IsectProgram);
      var index = gl.getUniformLocation(this.IsectProgram, "wr_RayOrigins");
	    gl.activeTexture(gl.TEXTURE0 + 0);
	    gl.bindTexture(gl.TEXTURE_2D, ray_buffers[0]);
	    gl.uniform1i(index, 0);
	    index = gl.getUniformLocation(this.IsectProgram, "wr_RayDirections");
	    gl.activeTexture(gl.TEXTURE0 + 1);
	    gl.bindTexture(gl.TEXTURE_2D, ray_buffers[1]);
	    gl.uniform1i(index, 1);
      index = gl.getUniformLocation(this.IsectProgram, "wr_ADS");
      gl.uniform1i(index, 0);
      
      var bindings = this.Bindings;
      var next_texture_unit = 2;
      for (var binding_index = 0; binding_index < bindings.length; ++binding_index) {		
        var binding = bindings[binding_index];
    
        /* if UBO */
        if (binding.Type == 1) {
          
        /* if Texture 2D */
        } else if (binding.Type == 2) {
          index = gl.getUniformLocation(this.IsectProgram, binding.Name);
          gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
          gl.bindTexture(gl.TEXTURE_2D, binding.Texture);
          gl.uniform1i(index, next_texture_unit);
          next_texture_unit++;
        /* if Texture Array 2D */
        } else if (binding.Type == 3) {
          index = gl.getUniformLocation(this.IsectProgram, binding.Name);
          gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, binding.Texture);
          gl.uniform1i(index, next_texture_unit);
          next_texture_unit++;
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      
      /* Rethink */
      gl.bindVertexArray(current_vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    this.OcclusionBufferDestroy = function(buffer) {
    };
    this.RayBufferDestroy = function(buffer) {
    };
    this.IntersectionBufferDestroy = function(buffer) {
    };
    this.CreateAds = function(options) {
      var ads_id_ptr = wrays_alloc_int();
      const options_count = wrays_count_options(options)
      const options_ptr = wrays_flatten_options(options)

      WebRaysModule['_wrays_ads_create'](this.Context, ads_id_ptr, options_ptr, options_count);
      var ads_id = wrays_create_int(ads_id_ptr);

      wrays_free_options(options_ptr, options_count);
      wrays_free(ads_id_ptr);

      return ads_id;
    };
    this.AddShape = function(ads, vertices, vertex_stride, normals, normal_stride, uvs, uv_stride, faces) {
      if ( vertices == null )
        return "error";

      var attr_count = vertices.length / vertex_stride;
      var face_count = faces.length / 4;
      var shape_id_ptr = wrays_alloc_int();
      
      var vertices_ptr = 0;
      if ( attr_count > 0 )
        vertices_ptr = wrays_array_to_heap(vertices);

      var normals_ptr = 0;
      if ( null != normals && normals.length > 0 )
        normals_ptr = wrays_array_to_heap(normals);
        
      var uvs_ptr = 0;
      if ( null != uvs && uvs.length > 0 )
        uvs_ptr = wrays_array_to_heap(uvs);
      
      var faces_ptr = 0;
      if ( face_count > 0 )
        faces_ptr = wrays_array_to_heap(faces);
         
      WebRaysModule['_wrays_add_shape'](this.Context, 0, vertices_ptr, vertex_stride, normals_ptr, normal_stride, uvs_ptr, uv_stride, attr_count, faces_ptr, face_count, shape_id_ptr);
      
      wrays_free(shape_id_ptr);
      if ( 0 != vertices_ptr) wrays_free(vertices_ptr);
      if ( 0 != normals_ptr) wrays_free(normals_ptr);
      if ( 0 != uvs_ptr) wrays_free(uvs_ptr);
      if ( 0 != faces_ptr) wrays_free(faces_ptr);
    };
  }
};

var Module=typeof WebRaysModule!=="undefined"?WebRaysModule:{};var moduleOverrides={};var key;for(key in Module){if(Module.hasOwnProperty(key)){moduleOverrides[key]=Module[key]}}var arguments_=[];var thisProgram="./this.program";var quit_=function(status,toThrow){throw toThrow};var ENVIRONMENT_IS_WEB=typeof window==="object";var ENVIRONMENT_IS_WORKER=typeof importScripts==="function";var ENVIRONMENT_IS_NODE=typeof process==="object"&&typeof process.versions==="object"&&typeof process.versions.node==="string";var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var read_,readAsync,readBinary,setWindowTitle;var nodeFS;var nodePath;if(ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){scriptDirectory=require("path").dirname(scriptDirectory)+"/"}else{scriptDirectory=__dirname+"/"}read_=function shell_read(filename,binary){if(!nodeFS)nodeFS=require("fs");if(!nodePath)nodePath=require("path");filename=nodePath["normalize"](filename);return nodeFS["readFileSync"](filename,binary?null:"utf8")};readBinary=function readBinary(filename){var ret=read_(filename,true);if(!ret.buffer){ret=new Uint8Array(ret)}assert(ret.buffer);return ret};readAsync=function readAsync(filename,onload,onerror){if(!nodeFS)nodeFS=require("fs");if(!nodePath)nodePath=require("path");filename=nodePath["normalize"](filename);nodeFS["readFile"](filename,function(err,data){if(err)onerror(err);else onload(data.buffer)})};if(process["argv"].length>1){thisProgram=process["argv"][1].replace(/\\/g,"/")}arguments_=process["argv"].slice(2);if(typeof module!=="undefined"){module["exports"]=Module}process["on"]("uncaughtException",function(ex){if(!(ex instanceof ExitStatus)){throw ex}});process["on"]("unhandledRejection",abort);quit_=function(status,toThrow){if(keepRuntimeAlive()){process["exitCode"]=status;throw toThrow}process["exit"](status)};Module["inspect"]=function(){return"[Emscripten Module object]"}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){if(ENVIRONMENT_IS_WORKER){scriptDirectory=self.location.href}else if(typeof document!=="undefined"&&document.currentScript){scriptDirectory=document.currentScript.src}if(scriptDirectory.indexOf("blob:")!==0){scriptDirectory=scriptDirectory.substr(0,scriptDirectory.lastIndexOf("/")+1)}else{scriptDirectory=""}{read_=function(url){var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.send(null);return xhr.responseText};if(ENVIRONMENT_IS_WORKER){readBinary=function(url){var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=function(url,onload,onerror){var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=function(){if(xhr.status==200||xhr.status==0&&xhr.response){onload(xhr.response);return}onerror()};xhr.onerror=onerror;xhr.send(null)}}setWindowTitle=function(title){document.title=title}}else{}var out=Module["print"]||console.log.bind(console);var err=Module["printErr"]||console.warn.bind(console);for(key in moduleOverrides){if(moduleOverrides.hasOwnProperty(key)){Module[key]=moduleOverrides[key]}}moduleOverrides=null;if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];if(Module["quit"])quit_=Module["quit"];var wasmBinary;if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];var noExitRuntime=Module["noExitRuntime"]||true;if(typeof WebAssembly!=="object"){abort("no native wasm support detected")}var wasmMemory;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort("Assertion failed: "+text)}}function getCFunc(ident){var func=Module["_"+ident];assert(func,"Cannot call unknown function "+ident+", make sure it is exported");return func}function ccall(ident,returnType,argTypes,args,opts){var toC={"string":function(str){var ret=0;if(str!==null&&str!==undefined&&str!==0){var len=(str.length<<2)+1;ret=stackAlloc(len);stringToUTF8(str,ret,len)}return ret},"array":function(arr){var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return ret}};function convertReturnValue(ret){if(returnType==="string")return UTF8ToString(ret);if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func.apply(null,cArgs);ret=convertReturnValue(ret);if(stack!==0)stackRestore(stack);return ret}function cwrap(ident,returnType,argTypes,opts){argTypes=argTypes||[];var numericArgs=argTypes.every(function(type){return type==="number"});var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return function(){return ccall(ident,returnType,argTypes,arguments,opts)}}var UTF8Decoder=typeof TextDecoder!=="undefined"?new TextDecoder("utf8"):undefined;function UTF8ArrayToString(heap,idx,maxBytesToRead){var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heap[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heap.subarray&&UTF8Decoder){return UTF8Decoder.decode(heap.subarray(idx,endPtr))}else{var str="";while(idx<endPtr){var u0=heap[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heap[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heap[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heap[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}}return str}function UTF8ToString(ptr,maxBytesToRead){return ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead):""}function stringToUTF8Array(str,heap,outIdx,maxBytesToWrite){if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343){var u1=str.charCodeAt(++i);u=65536+((u&1023)<<10)|u1&1023}if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}}heap[outIdx]=0;return outIdx-startIdx}function stringToUTF8(str,outPtr,maxBytesToWrite){return stringToUTF8Array(str,HEAPU8,outPtr,maxBytesToWrite)}function lengthBytesUTF8(str){var len=0;for(var i=0;i<str.length;++i){var u=str.charCodeAt(i);if(u>=55296&&u<=57343)u=65536+((u&1023)<<10)|str.charCodeAt(++i)&1023;if(u<=127)++len;else if(u<=2047)len+=2;else if(u<=65535)len+=3;else len+=4}return len}function writeArrayToMemory(array,buffer){HEAP8.set(array,buffer)}function alignUp(x,multiple){if(x%multiple>0){x+=multiple-x%multiple}return x}var buffer,HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;function updateGlobalBufferAndViews(buf){buffer=buf;Module["HEAP8"]=HEAP8=new Int8Array(buf);Module["HEAP16"]=HEAP16=new Int16Array(buf);Module["HEAP32"]=HEAP32=new Int32Array(buf);Module["HEAPU8"]=HEAPU8=new Uint8Array(buf);Module["HEAPU16"]=HEAPU16=new Uint16Array(buf);Module["HEAPU32"]=HEAPU32=new Uint32Array(buf);Module["HEAPF32"]=HEAPF32=new Float32Array(buf);Module["HEAPF64"]=HEAPF64=new Float64Array(buf)}var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||16777216;var wasmTable;var __ATPRERUN__=[];var __ATINIT__=[];var __ATPOSTRUN__=[];var runtimeInitialized=false;var runtimeKeepaliveCounter=0;function keepRuntimeAlive(){return noExitRuntime||runtimeKeepaliveCounter>0}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}callRuntimeCallbacks(__ATPRERUN__)}function initRuntime(){runtimeInitialized=true;callRuntimeCallbacks(__ATINIT__)}function postRun(){if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}callRuntimeCallbacks(__ATPOSTRUN__)}function addOnPreRun(cb){__ATPRERUN__.unshift(cb)}function addOnInit(cb){__ATINIT__.unshift(cb)}function addOnPostRun(cb){__ATPOSTRUN__.unshift(cb)}var runDependencies=0;var runDependencyWatcher=null;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies)}}function removeRunDependency(id){runDependencies--;if(Module["monitorRunDependencies"]){Module["monitorRunDependencies"](runDependencies)}if(runDependencies==0){if(runDependencyWatcher!==null){clearInterval(runDependencyWatcher);runDependencyWatcher=null}if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}}Module["preloadedImages"]={};Module["preloadedAudios"]={};function abort(what){if(Module["onAbort"]){Module["onAbort"](what)}what+="";err(what);ABORT=true;EXITSTATUS=1;what="abort("+what+"). Build with -s ASSERTIONS=1 for more info.";var e=new WebAssembly.RuntimeError(what);throw e}var dataURIPrefix="data:application/octet-stream;base64,";function isDataURI(filename){return filename.startsWith(dataURIPrefix)}function isFileURI(filename){return filename.startsWith("file://")}var wasmBinaryFile;wasmBinaryFile="webrays.wasm";if(!isDataURI(wasmBinaryFile)){wasmBinaryFile=locateFile(wasmBinaryFile)}function getBinary(file){try{if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}else{throw"both async and sync fetching of the wasm failed"}}catch(err){abort(err)}}function getBinaryPromise(){if(!wasmBinary&&(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER)){if(typeof fetch==="function"&&!isFileURI(wasmBinaryFile)){return fetch(wasmBinaryFile,{credentials:"same-origin"}).then(function(response){if(!response["ok"]){throw"failed to load wasm binary file at '"+wasmBinaryFile+"'"}return response["arrayBuffer"]()}).catch(function(){return getBinary(wasmBinaryFile)})}else{if(readAsync){return new Promise(function(resolve,reject){readAsync(wasmBinaryFile,function(response){resolve(new Uint8Array(response))},reject)})}}}return Promise.resolve().then(function(){return getBinary(wasmBinaryFile)})}function createWasm(){var info={"a":asmLibraryArg};function receiveInstance(instance,module){var exports=instance.exports;Module["asm"]=exports;wasmMemory=Module["asm"]["U"];updateGlobalBufferAndViews(wasmMemory.buffer);wasmTable=Module["asm"]["W"];addOnInit(Module["asm"]["V"]);removeRunDependency("wasm-instantiate")}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){receiveInstance(result["instance"])}function instantiateArrayBuffer(receiver){return getBinaryPromise().then(function(binary){var result=WebAssembly.instantiate(binary,info);return result}).then(receiver,function(reason){err("failed to asynchronously prepare wasm: "+reason);abort(reason)})}function instantiateAsync(){if(!wasmBinary&&typeof WebAssembly.instantiateStreaming==="function"&&!isDataURI(wasmBinaryFile)&&!isFileURI(wasmBinaryFile)&&typeof fetch==="function"){return fetch(wasmBinaryFile,{credentials:"same-origin"}).then(function(response){var result=WebAssembly.instantiateStreaming(response,info);return result.then(receiveInstantiationResult,function(reason){err("wasm streaming compile failed: "+reason);err("falling back to ArrayBuffer instantiation");return instantiateArrayBuffer(receiveInstantiationResult)})})}else{return instantiateArrayBuffer(receiveInstantiationResult)}}if(Module["instantiateWasm"]){try{var exports=Module["instantiateWasm"](info,receiveInstance);return exports}catch(e){err("Module.instantiateWasm callback failed with error: "+e);return false}}instantiateAsync();return{}}function callRuntimeCallbacks(callbacks){while(callbacks.length>0){var callback=callbacks.shift();if(typeof callback=="function"){callback(Module);continue}var func=callback.func;if(typeof func==="number"){if(callback.arg===undefined){wasmTable.get(func)()}else{wasmTable.get(func)(callback.arg)}}else{func(callback.arg===undefined?null:callback.arg)}}}function ___assert_fail(condition,filename,line,func){abort("Assertion failed: "+UTF8ToString(condition)+", at: "+[filename?UTF8ToString(filename):"unknown filename",line,func?UTF8ToString(func):"unknown function"])}function _abort(){abort()}function _emscripten_memcpy_big(dest,src,num){HEAPU8.copyWithin(dest,src,src+num)}function emscripten_realloc_buffer(size){try{wasmMemory.grow(size-buffer.byteLength+65535>>>16);updateGlobalBufferAndViews(wasmMemory.buffer);return 1}catch(e){}}function _emscripten_resize_heap(requestedSize){var oldSize=HEAPU8.length;requestedSize=requestedSize>>>0;var maxHeapSize=2147483648;if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignUp(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=emscripten_realloc_buffer(newSize);if(replacement){return true}}return false}var SYSCALLS={mappings:{},buffers:[null,[],[]],printChar:function(stream,curr){var buffer=SYSCALLS.buffers[stream];if(curr===0||curr===10){(stream===1?out:err)(UTF8ArrayToString(buffer,0));buffer.length=0}else{buffer.push(curr)}},varargs:undefined,get:function(){SYSCALLS.varargs+=4;var ret=HEAP32[SYSCALLS.varargs-4>>2];return ret},getStr:function(ptr){var ret=UTF8ToString(ptr);return ret},get64:function(low,high){return low}};function _fd_write(fd,iov,iovcnt,pnum){var num=0;for(var i=0;i<iovcnt;i++){var ptr=HEAP32[iov+i*8>>2];var len=HEAP32[iov+(i*8+4)>>2];for(var j=0;j<len;j++){SYSCALLS.printChar(fd,HEAPU8[ptr+j])}num+=len}HEAP32[pnum>>2]=num;return 0}function __webgl_enable_ANGLE_instanced_arrays(ctx){var ext=ctx.getExtension("ANGLE_instanced_arrays");if(ext){ctx["vertexAttribDivisor"]=function(index,divisor){ext["vertexAttribDivisorANGLE"](index,divisor)};ctx["drawArraysInstanced"]=function(mode,first,count,primcount){ext["drawArraysInstancedANGLE"](mode,first,count,primcount)};ctx["drawElementsInstanced"]=function(mode,count,type,indices,primcount){ext["drawElementsInstancedANGLE"](mode,count,type,indices,primcount)};return 1}}function __webgl_enable_OES_vertex_array_object(ctx){var ext=ctx.getExtension("OES_vertex_array_object");if(ext){ctx["createVertexArray"]=function(){return ext["createVertexArrayOES"]()};ctx["deleteVertexArray"]=function(vao){ext["deleteVertexArrayOES"](vao)};ctx["bindVertexArray"]=function(vao){ext["bindVertexArrayOES"](vao)};ctx["isVertexArray"]=function(vao){return ext["isVertexArrayOES"](vao)};return 1}}function __webgl_enable_WEBGL_draw_buffers(ctx){var ext=ctx.getExtension("WEBGL_draw_buffers");if(ext){ctx["drawBuffers"]=function(n,bufs){ext["drawBuffersWEBGL"](n,bufs)};return 1}}function __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(ctx){return!!(ctx.dibvbi=ctx.getExtension("WEBGL_draw_instanced_base_vertex_base_instance"))}function __webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(ctx){return!!(ctx.mdibvbi=ctx.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance"))}function __webgl_enable_WEBGL_multi_draw(ctx){return!!(ctx.multiDrawWebgl=ctx.getExtension("WEBGL_multi_draw"))}var GL={counter:1,buffers:[],mappedBuffers:{},programs:[],framebuffers:[],renderbuffers:[],textures:[],shaders:[],vaos:[],contexts:[],offscreenCanvases:{},queries:[],samplers:[],transformFeedbacks:[],syncs:[],byteSizeByTypeRoot:5120,byteSizeByType:[1,1,2,2,4,4,4,2,3,4,8],stringCache:{},stringiCache:{},unpackAlignment:4,recordError:function recordError(errorCode){if(!GL.lastError){GL.lastError=errorCode}},getNewId:function(table){var ret=GL.counter++;for(var i=table.length;i<ret;i++){table[i]=null}return ret},MAX_TEMP_BUFFER_SIZE:2097152,numTempVertexBuffersPerSize:64,log2ceilLookup:function(i){return 32-Math.clz32(i===0?0:i-1)},generateTempBuffers:function(quads,context){var largestIndex=GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);context.tempVertexBufferCounters1=[];context.tempVertexBufferCounters2=[];context.tempVertexBufferCounters1.length=context.tempVertexBufferCounters2.length=largestIndex+1;context.tempVertexBuffers1=[];context.tempVertexBuffers2=[];context.tempVertexBuffers1.length=context.tempVertexBuffers2.length=largestIndex+1;context.tempIndexBuffers=[];context.tempIndexBuffers.length=largestIndex+1;for(var i=0;i<=largestIndex;++i){context.tempIndexBuffers[i]=null;context.tempVertexBufferCounters1[i]=context.tempVertexBufferCounters2[i]=0;var ringbufferLength=GL.numTempVertexBuffersPerSize;context.tempVertexBuffers1[i]=[];context.tempVertexBuffers2[i]=[];var ringbuffer1=context.tempVertexBuffers1[i];var ringbuffer2=context.tempVertexBuffers2[i];ringbuffer1.length=ringbuffer2.length=ringbufferLength;for(var j=0;j<ringbufferLength;++j){ringbuffer1[j]=ringbuffer2[j]=null}}if(quads){context.tempQuadIndexBuffer=GLctx.createBuffer();context.GLctx.bindBuffer(34963,context.tempQuadIndexBuffer);var numIndexes=GL.MAX_TEMP_BUFFER_SIZE>>1;var quadIndexes=new Uint16Array(numIndexes);var i=0,v=0;while(1){quadIndexes[i++]=v;if(i>=numIndexes)break;quadIndexes[i++]=v+1;if(i>=numIndexes)break;quadIndexes[i++]=v+2;if(i>=numIndexes)break;quadIndexes[i++]=v;if(i>=numIndexes)break;quadIndexes[i++]=v+2;if(i>=numIndexes)break;quadIndexes[i++]=v+3;if(i>=numIndexes)break;v+=4}context.GLctx.bufferData(34963,quadIndexes,35044);context.GLctx.bindBuffer(34963,null)}},getTempVertexBuffer:function getTempVertexBuffer(sizeBytes){var idx=GL.log2ceilLookup(sizeBytes);var ringbuffer=GL.currentContext.tempVertexBuffers1[idx];var nextFreeBufferIndex=GL.currentContext.tempVertexBufferCounters1[idx];GL.currentContext.tempVertexBufferCounters1[idx]=GL.currentContext.tempVertexBufferCounters1[idx]+1&GL.numTempVertexBuffersPerSize-1;var vbo=ringbuffer[nextFreeBufferIndex];if(vbo){return vbo}var prevVBO=GLctx.getParameter(34964);ringbuffer[nextFreeBufferIndex]=GLctx.createBuffer();GLctx.bindBuffer(34962,ringbuffer[nextFreeBufferIndex]);GLctx.bufferData(34962,1<<idx,35048);GLctx.bindBuffer(34962,prevVBO);return ringbuffer[nextFreeBufferIndex]},getTempIndexBuffer:function getTempIndexBuffer(sizeBytes){var idx=GL.log2ceilLookup(sizeBytes);var ibo=GL.currentContext.tempIndexBuffers[idx];if(ibo){return ibo}var prevIBO=GLctx.getParameter(34965);GL.currentContext.tempIndexBuffers[idx]=GLctx.createBuffer();GLctx.bindBuffer(34963,GL.currentContext.tempIndexBuffers[idx]);GLctx.bufferData(34963,1<<idx,35048);GLctx.bindBuffer(34963,prevIBO);return GL.currentContext.tempIndexBuffers[idx]},newRenderingFrameStarted:function newRenderingFrameStarted(){if(!GL.currentContext){return}var vb=GL.currentContext.tempVertexBuffers1;GL.currentContext.tempVertexBuffers1=GL.currentContext.tempVertexBuffers2;GL.currentContext.tempVertexBuffers2=vb;vb=GL.currentContext.tempVertexBufferCounters1;GL.currentContext.tempVertexBufferCounters1=GL.currentContext.tempVertexBufferCounters2;GL.currentContext.tempVertexBufferCounters2=vb;var largestIndex=GL.log2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);for(var i=0;i<=largestIndex;++i){GL.currentContext.tempVertexBufferCounters1[i]=0}},getSource:function(shader,count,string,length){var source="";for(var i=0;i<count;++i){var len=length?HEAP32[length+i*4>>2]:-1;source+=UTF8ToString(HEAP32[string+i*4>>2],len<0?undefined:len)}return source},calcBufLength:function calcBufLength(size,type,stride,count){if(stride>0){return count*stride}var typeSize=GL.byteSizeByType[type-GL.byteSizeByTypeRoot];return size*typeSize*count},usedTempBuffers:[],preDrawHandleClientVertexAttribBindings:function preDrawHandleClientVertexAttribBindings(count){GL.resetBufferBinding=false;for(var i=0;i<GL.currentContext.maxVertexAttribs;++i){var cb=GL.currentContext.clientBuffers[i];if(!cb.clientside||!cb.enabled)continue;GL.resetBufferBinding=true;var size=GL.calcBufLength(cb.size,cb.type,cb.stride,count);var buf=GL.getTempVertexBuffer(size);GLctx.bindBuffer(34962,buf);GLctx.bufferSubData(34962,0,HEAPU8.subarray(cb.ptr,cb.ptr+size));cb.vertexAttribPointerAdaptor.call(GLctx,i,cb.size,cb.type,cb.normalized,cb.stride,0)}},postDrawHandleClientVertexAttribBindings:function postDrawHandleClientVertexAttribBindings(){if(GL.resetBufferBinding){GLctx.bindBuffer(34962,GL.buffers[GLctx.currentArrayBufferBinding])}},createContext:function(canvas,webGLContextAttributes){if(!canvas.getContextSafariWebGL2Fixed){canvas.getContextSafariWebGL2Fixed=canvas.getContext;canvas.getContext=function(ver,attrs){var gl=canvas.getContextSafariWebGL2Fixed(ver,attrs);return ver=="webgl"==gl instanceof WebGLRenderingContext?gl:null}}if(Module["preinitializedWebGLContext"]){var ctx=Module["preinitializedWebGLContext"];webGLContextAttributes.majorVersion=typeof WebGL2RenderingContext!=="undefined"&&ctx instanceof WebGL2RenderingContext?2:1}else{var ctx=webGLContextAttributes.majorVersion>1?canvas.getContext("webgl2",webGLContextAttributes):canvas.getContext("webgl",webGLContextAttributes)}if(!ctx)return 0;var handle=GL.registerContext(ctx,webGLContextAttributes);return handle},registerContext:function(ctx,webGLContextAttributes){var handle=GL.getNewId(GL.contexts);var context={handle:handle,attributes:webGLContextAttributes,version:webGLContextAttributes.majorVersion,GLctx:ctx};if(ctx.canvas)ctx.canvas.GLctxObject=context;GL.contexts[handle]=context;if(typeof webGLContextAttributes.enableExtensionsByDefault==="undefined"||webGLContextAttributes.enableExtensionsByDefault){GL.initExtensions(context)}context.maxVertexAttribs=context.GLctx.getParameter(34921);context.clientBuffers=[];for(var i=0;i<context.maxVertexAttribs;i++){context.clientBuffers[i]={enabled:false,clientside:false,size:0,type:0,normalized:0,stride:0,ptr:0,vertexAttribPointerAdaptor:null}}GL.generateTempBuffers(false,context);return handle},makeContextCurrent:function(contextHandle){GL.currentContext=GL.contexts[contextHandle];Module.ctx=GLctx=GL.currentContext&&GL.currentContext.GLctx;return!(contextHandle&&!GLctx)},getContext:function(contextHandle){return GL.contexts[contextHandle]},deleteContext:function(contextHandle){if(GL.currentContext===GL.contexts[contextHandle])GL.currentContext=null;if(typeof JSEvents==="object")JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);if(GL.contexts[contextHandle]&&GL.contexts[contextHandle].GLctx.canvas)GL.contexts[contextHandle].GLctx.canvas.GLctxObject=undefined;GL.contexts[contextHandle]=null},initExtensions:function(context){if(!context)context=GL.currentContext;if(context.initExtensionsDone)return;context.initExtensionsDone=true;var GLctx=context.GLctx;__webgl_enable_ANGLE_instanced_arrays(GLctx);__webgl_enable_OES_vertex_array_object(GLctx);__webgl_enable_WEBGL_draw_buffers(GLctx);__webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);__webgl_enable_WEBGL_multi_draw_instanced_base_vertex_base_instance(GLctx);if(context.version>=2){GLctx.disjointTimerQueryExt=GLctx.getExtension("EXT_disjoint_timer_query_webgl2")}if(context.version<2||!GLctx.disjointTimerQueryExt){GLctx.disjointTimerQueryExt=GLctx.getExtension("EXT_disjoint_timer_query")}__webgl_enable_WEBGL_multi_draw(GLctx);var exts=GLctx.getSupportedExtensions()||[];exts.forEach(function(ext){if(!ext.includes("lose_context")&&!ext.includes("debug")){GLctx.getExtension(ext)}})}};function _glActiveTexture(x0){GLctx["activeTexture"](x0)}function _glAttachShader(program,shader){GLctx.attachShader(GL.programs[program],GL.shaders[shader])}function _glBindBuffer(target,buffer){if(target==34962){GLctx.currentArrayBufferBinding=buffer}else if(target==34963){GLctx.currentElementArrayBufferBinding=buffer}if(target==35051){GLctx.currentPixelPackBufferBinding=buffer}else if(target==35052){GLctx.currentPixelUnpackBufferBinding=buffer}GLctx.bindBuffer(target,GL.buffers[buffer])}function _glBindFramebuffer(target,framebuffer){GLctx.bindFramebuffer(target,GL.framebuffers[framebuffer])}function _glBindTexture(target,texture){GLctx.bindTexture(target,GL.textures[texture])}function _glBindVertexArray(vao){GLctx["bindVertexArray"](GL.vaos[vao]);var ibo=GLctx.getParameter(34965);GLctx.currentElementArrayBufferBinding=ibo?ibo.name|0:0}function _glBufferData(target,size,data,usage){if(GL.currentContext.version>=2){if(data){GLctx.bufferData(target,HEAPU8,usage,data,size)}else{GLctx.bufferData(target,size,usage)}}else{GLctx.bufferData(target,data?HEAPU8.subarray(data,data+size):size,usage)}}function _glCheckFramebufferStatus(x0){return GLctx["checkFramebufferStatus"](x0)}function _glCompileShader(shader){GLctx.compileShader(GL.shaders[shader])}function _glCreateProgram(){var id=GL.getNewId(GL.programs);var program=GLctx.createProgram();program.name=id;program.maxUniformLength=program.maxAttributeLength=program.maxUniformBlockNameLength=0;program.uniformIdCounter=1;GL.programs[id]=program;return id}function _glCreateShader(shaderType){var id=GL.getNewId(GL.shaders);GL.shaders[id]=GLctx.createShader(shaderType);return id}function _glDeleteProgram(id){if(!id)return;var program=GL.programs[id];if(!program){GL.recordError(1281);return}GLctx.deleteProgram(program);program.name=0;GL.programs[id]=null}function _glDeleteShader(id){if(!id)return;var shader=GL.shaders[id];if(!shader){GL.recordError(1281);return}GLctx.deleteShader(shader);GL.shaders[id]=null}function _glDeleteTextures(n,textures){for(var i=0;i<n;i++){var id=HEAP32[textures+i*4>>2];var texture=GL.textures[id];if(!texture)continue;GLctx.deleteTexture(texture);texture.name=0;GL.textures[id]=null}}function _glDetachShader(program,shader){GLctx.detachShader(GL.programs[program],GL.shaders[shader])}function _glDrawArrays(mode,first,count){GL.preDrawHandleClientVertexAttribBindings(first+count);GLctx.drawArrays(mode,first,count);GL.postDrawHandleClientVertexAttribBindings()}var tempFixedLengthArray=[];function _glDrawBuffers(n,bufs){var bufArray=tempFixedLengthArray[n];for(var i=0;i<n;i++){bufArray[i]=HEAP32[bufs+i*4>>2]}GLctx["drawBuffers"](bufArray)}function _glEnableVertexAttribArray(index){var cb=GL.currentContext.clientBuffers[index];cb.enabled=true;GLctx.enableVertexAttribArray(index)}function _glFramebufferTexture2D(target,attachment,textarget,texture,level){GLctx.framebufferTexture2D(target,attachment,textarget,GL.textures[texture],level)}function __glGenObject(n,buffers,createFunction,objectTable){for(var i=0;i<n;i++){var buffer=GLctx[createFunction]();var id=buffer&&GL.getNewId(objectTable);if(buffer){buffer.name=id;objectTable[id]=buffer}else{GL.recordError(1282)}HEAP32[buffers+i*4>>2]=id}}function _glGenBuffers(n,buffers){__glGenObject(n,buffers,"createBuffer",GL.buffers)}function _glGenFramebuffers(n,ids){__glGenObject(n,ids,"createFramebuffer",GL.framebuffers)}function _glGenQueries(n,ids){__glGenObject(n,ids,"createQuery",GL.queries)}function _glGenTextures(n,textures){__glGenObject(n,textures,"createTexture",GL.textures)}function _glGenVertexArrays(n,arrays){__glGenObject(n,arrays,"createVertexArray",GL.vaos)}function _glGetError(){var error=GLctx.getError()||GL.lastError;GL.lastError=0;return error}function _glGetProgramInfoLog(program,maxLength,length,infoLog){var log=GLctx.getProgramInfoLog(GL.programs[program]);if(log===null)log="(unknown error)";var numBytesWrittenExclNull=maxLength>0&&infoLog?stringToUTF8(log,infoLog,maxLength):0;if(length)HEAP32[length>>2]=numBytesWrittenExclNull}function _glGetProgramiv(program,pname,p){if(!p){GL.recordError(1281);return}if(program>=GL.counter){GL.recordError(1281);return}program=GL.programs[program];if(pname==35716){var log=GLctx.getProgramInfoLog(program);if(log===null)log="(unknown error)";HEAP32[p>>2]=log.length+1}else if(pname==35719){if(!program.maxUniformLength){for(var i=0;i<GLctx.getProgramParameter(program,35718);++i){program.maxUniformLength=Math.max(program.maxUniformLength,GLctx.getActiveUniform(program,i).name.length+1)}}HEAP32[p>>2]=program.maxUniformLength}else if(pname==35722){if(!program.maxAttributeLength){for(var i=0;i<GLctx.getProgramParameter(program,35721);++i){program.maxAttributeLength=Math.max(program.maxAttributeLength,GLctx.getActiveAttrib(program,i).name.length+1)}}HEAP32[p>>2]=program.maxAttributeLength}else if(pname==35381){if(!program.maxUniformBlockNameLength){for(var i=0;i<GLctx.getProgramParameter(program,35382);++i){program.maxUniformBlockNameLength=Math.max(program.maxUniformBlockNameLength,GLctx.getActiveUniformBlockName(program,i).length+1)}}HEAP32[p>>2]=program.maxUniformBlockNameLength}else{HEAP32[p>>2]=GLctx.getProgramParameter(program,pname)}}function _glGetShaderInfoLog(shader,maxLength,length,infoLog){var log=GLctx.getShaderInfoLog(GL.shaders[shader]);if(log===null)log="(unknown error)";var numBytesWrittenExclNull=maxLength>0&&infoLog?stringToUTF8(log,infoLog,maxLength):0;if(length)HEAP32[length>>2]=numBytesWrittenExclNull}function _glGetShaderiv(shader,pname,p){if(!p){GL.recordError(1281);return}if(pname==35716){var log=GLctx.getShaderInfoLog(GL.shaders[shader]);if(log===null)log="(unknown error)";var logLength=log?log.length+1:0;HEAP32[p>>2]=logLength}else if(pname==35720){var source=GLctx.getShaderSource(GL.shaders[shader]);var sourceLength=source?source.length+1:0;HEAP32[p>>2]=sourceLength}else{HEAP32[p>>2]=GLctx.getShaderParameter(GL.shaders[shader],pname)}}function jstoi_q(str){return parseInt(str)}function webglGetLeftBracePos(name){return name.slice(-1)=="]"&&name.lastIndexOf("[")}function webglPrepareUniformLocationsBeforeFirstUse(program){var uniformLocsById=program.uniformLocsById,uniformSizeAndIdsByName=program.uniformSizeAndIdsByName,i,j;if(!uniformLocsById){program.uniformLocsById=uniformLocsById={};program.uniformArrayNamesById={};for(i=0;i<GLctx.getProgramParameter(program,35718);++i){var u=GLctx.getActiveUniform(program,i);var nm=u.name;var sz=u.size;var lb=webglGetLeftBracePos(nm);var arrayName=lb>0?nm.slice(0,lb):nm;var id=program.uniformIdCounter;program.uniformIdCounter+=sz;uniformSizeAndIdsByName[arrayName]=[sz,id];for(j=0;j<sz;++j){uniformLocsById[id]=j;program.uniformArrayNamesById[id++]=arrayName}}}}function _glGetUniformLocation(program,name){name=UTF8ToString(name);if(program=GL.programs[program]){webglPrepareUniformLocationsBeforeFirstUse(program);var uniformLocsById=program.uniformLocsById;var arrayIndex=0;var uniformBaseName=name;var leftBrace=webglGetLeftBracePos(name);if(leftBrace>0){arrayIndex=jstoi_q(name.slice(leftBrace+1))>>>0;uniformBaseName=name.slice(0,leftBrace)}var sizeAndId=program.uniformSizeAndIdsByName[uniformBaseName];if(sizeAndId&&arrayIndex<sizeAndId[0]){arrayIndex+=sizeAndId[1];if(uniformLocsById[arrayIndex]=uniformLocsById[arrayIndex]||GLctx.getUniformLocation(program,name)){return arrayIndex}}}else{GL.recordError(1281)}return-1}function _glIsProgram(program){program=GL.programs[program];if(!program)return 0;return GLctx.isProgram(program)}function _glIsTexture(id){var texture=GL.textures[id];if(!texture)return 0;return GLctx.isTexture(texture)}function _glLinkProgram(program){program=GL.programs[program];GLctx.linkProgram(program);program.uniformLocsById=0;program.uniformSizeAndIdsByName={}}function _glShaderSource(shader,count,string,length){var source=GL.getSource(shader,count,string,length);GLctx.shaderSource(GL.shaders[shader],source)}function _glTexParameteri(x0,x1,x2){GLctx["texParameteri"](x0,x1,x2)}function _glTexStorage3D(x0,x1,x2,x3,x4,x5){GLctx["texStorage3D"](x0,x1,x2,x3,x4,x5)}function heapObjectForWebGLType(type){type-=5120;if(type==0)return HEAP8;if(type==1)return HEAPU8;if(type==2)return HEAP16;if(type==4)return HEAP32;if(type==6)return HEAPF32;if(type==5||type==28922||type==28520||type==30779||type==30782)return HEAPU32;return HEAPU16}function heapAccessShiftForWebGLHeap(heap){return 31-Math.clz32(heap.BYTES_PER_ELEMENT)}function _glTexSubImage3D(target,level,xoffset,yoffset,zoffset,width,height,depth,format,type,pixels){if(GLctx.currentPixelUnpackBufferBinding){GLctx["texSubImage3D"](target,level,xoffset,yoffset,zoffset,width,height,depth,format,type,pixels)}else if(pixels){var heap=heapObjectForWebGLType(type);GLctx["texSubImage3D"](target,level,xoffset,yoffset,zoffset,width,height,depth,format,type,heap,pixels>>heapAccessShiftForWebGLHeap(heap))}else{GLctx["texSubImage3D"](target,level,xoffset,yoffset,zoffset,width,height,depth,format,type,null)}}function webglGetUniformLocation(location){var p=GLctx.currentProgram;if(p){var webglLoc=p.uniformLocsById[location];if(typeof webglLoc==="number"){p.uniformLocsById[location]=webglLoc=GLctx.getUniformLocation(p,p.uniformArrayNamesById[location]+(webglLoc>0?"["+webglLoc+"]":""))}return webglLoc}else{GL.recordError(1282)}}function _glUniform1i(location,v0){GLctx.uniform1i(webglGetUniformLocation(location),v0)}function _glUseProgram(program){program=GL.programs[program];GLctx.useProgram(program);GLctx.currentProgram=program}function _glVertexAttribPointer(index,size,type,normalized,stride,ptr){var cb=GL.currentContext.clientBuffers[index];if(!GLctx.currentArrayBufferBinding){cb.size=size;cb.type=type;cb.normalized=normalized;cb.stride=stride;cb.ptr=ptr;cb.clientside=true;cb.vertexAttribPointerAdaptor=function(index,size,type,normalized,stride,ptr){this.vertexAttribPointer(index,size,type,normalized,stride,ptr)};return}cb.clientside=false;GLctx.vertexAttribPointer(index,size,type,!!normalized,stride,ptr)}function _glViewport(x0,x1,x2,x3){GLctx["viewport"](x0,x1,x2,x3)}var GLctx;for(var i=0;i<32;++i)tempFixedLengthArray.push(new Array(i));var asmLibraryArg={"E":___assert_fail,"h":_abort,"G":_emscripten_memcpy_big,"H":_emscripten_resize_heap,"p":_fd_write,"l":_glActiveTexture,"t":_glAttachShader,"D":_glBindBuffer,"m":_glBindFramebuffer,"c":_glBindTexture,"n":_glBindVertexArray,"S":_glBufferData,"A":_glCheckFramebufferStatus,"M":_glCompileShader,"K":_glCreateProgram,"O":_glCreateShader,"o":_glDeleteProgram,"q":_glDeleteShader,"k":_glDeleteTextures,"s":_glDetachShader,"w":_glDrawArrays,"y":_glDrawBuffers,"R":_glEnableVertexAttribArray,"B":_glFramebufferTexture2D,"T":_glGenBuffers,"C":_glGenFramebuffers,"P":_glGenQueries,"j":_glGenTextures,"F":_glGenVertexArrays,"a":_glGetError,"I":_glGetProgramInfoLog,"r":_glGetProgramiv,"L":_glGetShaderInfoLog,"u":_glGetShaderiv,"g":_glGetUniformLocation,"v":_glIsProgram,"e":_glIsTexture,"J":_glLinkProgram,"N":_glShaderSource,"b":_glTexParameteri,"i":_glTexStorage3D,"d":_glTexSubImage3D,"f":_glUniform1i,"x":_glUseProgram,"Q":_glVertexAttribPointer,"z":_glViewport};var asm=createWasm();var ___wasm_call_ctors=Module["___wasm_call_ctors"]=function(){return(___wasm_call_ctors=Module["___wasm_call_ctors"]=Module["asm"]["V"]).apply(null,arguments)};var _wrays_version=Module["_wrays_version"]=function(){return(_wrays_version=Module["_wrays_version"]=Module["asm"]["X"]).apply(null,arguments)};var _wrays_version_string=Module["_wrays_version_string"]=function(){return(_wrays_version_string=Module["_wrays_version_string"]=Module["asm"]["Y"]).apply(null,arguments)};var _wrays_init=Module["_wrays_init"]=function(){return(_wrays_init=Module["_wrays_init"]=Module["asm"]["Z"]).apply(null,arguments)};var _malloc=Module["_malloc"]=function(){return(_malloc=Module["_malloc"]=Module["asm"]["_"]).apply(null,arguments)};var _wrays_ads_create=Module["_wrays_ads_create"]=function(){return(_wrays_ads_create=Module["_wrays_ads_create"]=Module["asm"]["$"]).apply(null,arguments)};var _wrays_add_shape=Module["_wrays_add_shape"]=function(){return(_wrays_add_shape=Module["_wrays_add_shape"]=Module["asm"]["aa"]).apply(null,arguments)};var _wrays_instance_add=Module["_wrays_instance_add"]=function(){return(_wrays_instance_add=Module["_wrays_instance_add"]=Module["asm"]["ba"]).apply(null,arguments)};var _wrays_instance_update=Module["_wrays_instance_update"]=function(){return(_wrays_instance_update=Module["_wrays_instance_update"]=Module["asm"]["ca"]).apply(null,arguments)};var _wrays_get_scene_accessor=Module["_wrays_get_scene_accessor"]=function(){return(_wrays_get_scene_accessor=Module["_wrays_get_scene_accessor"]=Module["asm"]["da"]).apply(null,arguments)};var _wrays_ray_buffer_requirements=Module["_wrays_ray_buffer_requirements"]=function(){return(_wrays_ray_buffer_requirements=Module["_wrays_ray_buffer_requirements"]=Module["asm"]["ea"]).apply(null,arguments)};var _wrays_occlusion_buffer_requirements=Module["_wrays_occlusion_buffer_requirements"]=function(){return(_wrays_occlusion_buffer_requirements=Module["_wrays_occlusion_buffer_requirements"]=Module["asm"]["fa"]).apply(null,arguments)};var _wrays_intersection_buffer_requirements=Module["_wrays_intersection_buffer_requirements"]=function(){return(_wrays_intersection_buffer_requirements=Module["_wrays_intersection_buffer_requirements"]=Module["asm"]["ga"]).apply(null,arguments)};var _wrays_get_scene_accessor_bindings=Module["_wrays_get_scene_accessor_bindings"]=function(){return(_wrays_get_scene_accessor_bindings=Module["_wrays_get_scene_accessor_bindings"]=Module["asm"]["ha"]).apply(null,arguments)};var _wrays_query_intersection=Module["_wrays_query_intersection"]=function(){return(_wrays_query_intersection=Module["_wrays_query_intersection"]=Module["asm"]["ia"]).apply(null,arguments)};var _wrays_query_occlusion=Module["_wrays_query_occlusion"]=function(){return(_wrays_query_occlusion=Module["_wrays_query_occlusion"]=Module["asm"]["ja"]).apply(null,arguments)};var _wrays_update=Module["_wrays_update"]=function(){return(_wrays_update=Module["_wrays_update"]=Module["asm"]["ka"]).apply(null,arguments)};var _wrays_destroy=Module["_wrays_destroy"]=function(){return(_wrays_destroy=Module["_wrays_destroy"]=Module["asm"]["la"]).apply(null,arguments)};var _wrays_ray_buffer_destroy=Module["_wrays_ray_buffer_destroy"]=function(){return(_wrays_ray_buffer_destroy=Module["_wrays_ray_buffer_destroy"]=Module["asm"]["ma"]).apply(null,arguments)};var _wrays_intersection_buffer_destroy=Module["_wrays_intersection_buffer_destroy"]=function(){return(_wrays_intersection_buffer_destroy=Module["_wrays_intersection_buffer_destroy"]=Module["asm"]["na"]).apply(null,arguments)};var _wrays_occlusion_buffer_destroy=Module["_wrays_occlusion_buffer_destroy"]=function(){return(_wrays_occlusion_buffer_destroy=Module["_wrays_occlusion_buffer_destroy"]=Module["asm"]["oa"]).apply(null,arguments)};var __wrays_internal_get_intersection_kernel=Module["__wrays_internal_get_intersection_kernel"]=function(){return(__wrays_internal_get_intersection_kernel=Module["__wrays_internal_get_intersection_kernel"]=Module["asm"]["pa"]).apply(null,arguments)};var __wrays_internal_get_occlusion_kernel=Module["__wrays_internal_get_occlusion_kernel"]=function(){return(__wrays_internal_get_occlusion_kernel=Module["__wrays_internal_get_occlusion_kernel"]=Module["asm"]["qa"]).apply(null,arguments)};var _free=Module["_free"]=function(){return(_free=Module["_free"]=Module["asm"]["ra"]).apply(null,arguments)};var stackSave=Module["stackSave"]=function(){return(stackSave=Module["stackSave"]=Module["asm"]["sa"]).apply(null,arguments)};var stackRestore=Module["stackRestore"]=function(){return(stackRestore=Module["stackRestore"]=Module["asm"]["ta"]).apply(null,arguments)};var stackAlloc=Module["stackAlloc"]=function(){return(stackAlloc=Module["stackAlloc"]=Module["asm"]["ua"]).apply(null,arguments)};Module["cwrap"]=cwrap;Module["lengthBytesUTF8"]=lengthBytesUTF8;var calledRun;function ExitStatus(status){this.name="ExitStatus";this.message="Program terminated with exit("+status+")";this.status=status}dependenciesFulfilled=function runCaller(){if(!calledRun)run();if(!calledRun)dependenciesFulfilled=runCaller};function run(args){args=args||arguments_;if(runDependencies>0){return}preRun();if(runDependencies>0){return}function doRun(){if(calledRun)return;calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();if(Module["onRuntimeInitialized"])Module["onRuntimeInitialized"]();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(function(){setTimeout(function(){Module["setStatus"]("")},1);doRun()},1)}else{doRun()}}Module["run"]=run;if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].pop()()}}run();
