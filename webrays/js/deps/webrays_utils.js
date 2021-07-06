"use strict";

// 
// Singleton design pattern constructor
//
var wr;
function webrays_get_instance()
{
    if(!wr)
      wr = new WebRays.WebGLIntersectionEngine(gl);
}

//
// Precreate the GL context 
//
function webrays_module_init(context)
{
    // We need this if we want to initialize the WebGL context from the Javascript side
    WebRaysModule.preinitializedWebGLContext = context;
}

// 
// Acceleration data structure creation and fill with mesh info
//
function webrays_ads_init(mesh)
{
    let ads_index = wr.CreateAds({type : "BLAS" });
    wr.AddShape(ads_index, mesh.vertex_data, mesh.vertex_size,
                           mesh.normal_data, mesh.normal_size,
                           mesh.uv_data    , mesh.uv_size,
                           mesh.face_data
                );
    return ads_index;
}

// 
// Build ADS & get generated shader source
//
function webrays_get_shader_source()
{
    return (wr.Update() == 0) ? null : wr.GetSceneAccessorString();
}

// 
// Map ADS bindings to the corresponding shader program
//
function webrays_bindings(program, next_texture_unit)
{
    let ads_index = 0;
    gl.uniform1i(gl.getUniformLocation(program, "wr_ads_index"), ads_index); 

    var bindings = wr.Bindings;
    for (var binding_index = 0; binding_index < bindings.length; ++binding_index)
    {		
      let binding = bindings[binding_index];

      // if UBO
      if (binding.Type == 1) {
      } 
      // if Texture 2D or Texture Array 2D
      else {
        let bindingType = (binding.Type == 2) ? gl.TEXTURE_2D : gl.TEXTURE_2D_ARRAY;
        
        gl.activeTexture(gl.TEXTURE0 + next_texture_unit);
        gl.bindTexture  (bindingType, binding.Texture);
        gl.uniform1i    (gl.getUniformLocation(program, binding.Name), next_texture_unit);
        next_texture_unit++;
      }
    }

    return next_texture_unit;
}