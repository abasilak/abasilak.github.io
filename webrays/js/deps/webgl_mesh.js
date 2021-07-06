"use strict";

const MaterialType = {
  PERFECT_SPECULAR : 0,
  FRESNEL_SPECULAR : 1,
  CT_GGX : 2,
  LAMBERT : 3,  
  DISNEY : 4, // ??
  THICK_GLASS : 5 // ??
};

const IOR_VALUES = {
  n_index_air : 1.000293,
  n_index_water : 1.333,
  n_index_ice : 1.31,
  n_index_glass : 1.52,
  n_index_diamond : 2.417,
  n_index_amber : 1.55,
  n_index_sapphire : 1.77
}

const insertArray = (arr, ob) =>
{
  if(ob === null)
    return -1;
  let index = arr.indexOf(ob.index);
  if(index === -1)
  {
    index = arr.length;
    arr.push(ob.index);
  }
  return index;
}

function webrays_parse_mtl(text)
{
  const NEWMTL_RE = /^newmtl\s/;
  const SHININESS_RE = /^Ns\s/; // shininess
  const KD_RE = /^Kd\s/;
  const KS_RE = /^Ks\s/;
  const KE_RE = /^Ke\s/; // emissive
  const D_RE = /^d\s/; // opacity. Format alternatively support Tr which is (1 - d)
  const IOR_RE = /^Ni\s/;
  const ILLUM_MODEL_RE = /^illum\s/; // [0-2] Phong, [3,8,9] Reflection, 4 Glass, 5 Fresnel Reflection, [6,7] Refraction
  const MAP_KD_RE = /^map_Kd\s/;
  const MAP_KS_RE = /^map_Ks\s/;
  const MAP_NS_RE = /^map_Ns\s/;
  const MAP_NORMAL_RE = /^map_Bump\s/;
  const WHITESPACE_RE = /\s+/;  

  let materials = [];
  let currentMaterial = null;

  const lines = text.split("\n");
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const elements = line.split(WHITESPACE_RE);
    elements.shift();
    if (NEWMTL_RE.test(line)) {
      if(currentMaterial !== null)
        materials.push(currentMaterial);      
      currentMaterial = { 
        name: elements[0],
        type: 3, //type : 0 - perfect specular, 1 - fresnel specular, 2 - CT GGX, 3 - Lambert, 
        Kd: [0, 0, 0],
        Ks: [0,0,0],
        Ns: 0,
        ior: 1,
        map_Kd: null,
        map_Ks: null,
        map_Ns: null,
        map_bump: null,
      }
    }
    else if (KD_RE.test(line)) {
      currentMaterial.Kd = [...elements];
    }
    else if (KS_RE.test(line)) {
      currentMaterial.Ks = [...elements];
    }
    else if (SHININESS_RE.test(line)) {
      const shininess = parseFloat(elements[0]);
      currentMaterial.Ns = shininess;
    }
    else if (IOR_RE.test(line)) {
      currentMaterial.ior = parseFloat(elements[0]);
    }
    else if (MAP_KD_RE.test(line)) {
      currentMaterial.map_Kd = elements[0];
    }
    else if (MAP_KS_RE.test(line)) {
      currentMaterial.map_Ks = elements[0];
    }
    else if (MAP_NORMAL_RE.test(line)) {
      currentMaterial.map_bump = elements[0];
    }
    else if (ILLUM_MODEL_RE.test(line)) {
      // [0-2] Phong, [3,8,9] Reflection, 4 Glass, 5 Fresnel Reflection, [6,7] Refraction
      //type : 0 - perfect specular, 1 - fresnel specular, 2 - CT GGX, 3 - Lambert, 
      let model = parseInt(elements[0]);
      switch(model)
      {
        case 0:
        case 1:
        case 2:
          currentMaterial.type = 2;
          break;
        case 3:
        case 8:
        case 9:
          currentMaterial.type = 0;
          break;
        case 4:
        case 5:
        case 6:
        case 7:
          currentMaterial.type = 1;
          break;
      }
    }
  }
  if(currentMaterial !== null)
    materials.push(currentMaterial);

  let textures = [];
  for(let element of materials)
  {
    if(element.map_Kd)
    {
      let index = textures.indexOf(element.map_Kd);
      if(index === -1)
      {
        index = textures.length;
        textures.push(element.map_Kd);
      }
      element.map_Kd = index;
    }
    else
      element.map_Kd = -1;

    if(element.map_Ks)
    {
      let index = textures.indexOf(element.map_Ks);
      if(index === -1)
      {
        index = textures.length;
        textures.push(element.map_Ks);
      }
      element.map_Ks = index;
    }
    else
      element.map_Ks = -1;

    if(element.map_bump)
    {
      let index = textures.indexOf(element.map_bump);
      if(index === -1)
      {
        index = textures.length;
        textures.push(element.map_bump);
      }
      element.map_bump = index;
    }
    else
      element.map_bump = -1;
  }
  console.log(materials);

  // convert to our system
  materials = materials.map(element => {

    let max_diff = Math.max(element.Kd);
	  let max_spec = Math.max(element.Ks);
    let metallic = max_spec / (max_spec + max_diff);
    
    let color = [Math.max(element.Kd[0], element.Ks[0]),
    Math.max(element.Kd[1], element.Ks[1]),
    Math.max(element.Kd[2], element.Ks[2])];

    //currentMaterial.roughness = 1.0 - glm::clamp(prev_mat.shininess / 128, 0.f, 1.f);
    let roughness = Math.sqrt(2.0 / (element.Ns + 2.0)); // from graphics rants UE4
    roughness = Math.sqrt(roughness); // from graphics rants UE4
    return {
      type: element.type,
      baseColor: color,

      nIndex: element.ior,
      metallic:metallic,
      roughness: roughness,
      reflectance: 0.5,

      baseColorTexture: element.map_Kd,
      MetallicRoughnessTexture: -1,
      NormalsTexture: element.map_bump,
      UnusedTexture: -1
    }
  });
  return {texures: textures, mats: materials};
}

function webrays_load_obj(url, mat_url = null)
{
  const objPromise = fetch(url).then(res => {
    return res.text();
  }).then(res => {
    let mesh = new OBJ.Mesh(res);
    console.log(mesh);
    return mesh;
  }).catch(error => {
    console.log("Error ", error);
    return null;
  });

  const mtlPromise = fetch(mat_url).then(res => {
    return res.text();
  }).then(res => {
    console.log("Material");
    let mtls = webrays_parse_mtl(res);
    console.log(mtls);
    return mtls;
  }).catch(error => {
    console.log("Error ", error);
    return null;
  });


  return Promise.all([objPromise, mtlPromise]).then(res => {
    console.log("Heeee");
    console.log(res);
    res[0].flip_textures = true;
    return res[0];
  });  
};

function webrays_gltf_load_nodes(glTF, r_mesh, node, parentModel = null)
{
  let model = (node.matrix !== null)? glMatrix.mat4.copy(glMatrix.mat4.create(), node.matrix) : null;
  if(parentModel !== null && model !== null)
    model = glMatrix.mat4.multiply(glMatrix.mat4.create(), parentModel, model);
  
  for(let i = 0; i < node.children.length; i++)
  {
    if(node.children[i].mesh === null)
    {   
      webrays_gltf_load_nodes(glTF, r_mesh, node.children[i], model);
    }
    else
    {
      webrays_gltf_load_mesh(glTF, r_mesh, node.children[i], model);
    }
  }
}

function webrays_gltf_load_mesh(glTF, r_mesh, node, parentModel = null)
{
  // GLTF loader returns matrix as an Float32Array. glMatrix.* are Float32Arrays
  let model = (node.matrix !== null)? glMatrix.mat4.copy(glMatrix.mat4.create(), node.matrix) : null;
  if(parentModel !== null)
    model = glMatrix.mat4.multiply(glMatrix.mat4.create(), parentModel, model);
  const normalMatrix = (node.matrix !== null)? glMatrix.mat3.normalFromMat4(glMatrix.mat3.create(), model) : null;

  const mesh = node.mesh;
  let indexOffset = 0;
  indexOffset = r_mesh.vertices.length / 3;
  for(let j = 0; j < mesh.primitives.length; j++)
  {
    const primitive = mesh.primitives[j];
    indexOffset = r_mesh.vertices.length / 3;

    //console.log("Primitive: ", primitive);

    if(primitive.indices !== null)
    {
      const accessor = glTF.accessors[primitive.indices];
      //console.log("Count: ", accessor.count);
      //console.log("Node: ", mesh);
      accessor.bufferView.data;
      accessor.byteOffset;
      accessor.count;
      accessor.type;
      accessor.componentType; // 5126 FLOAT, 5123 UNSIGNED_SHORT, 5125 UINT
      primitive.indicesOffset; // 0
      primitive.indicesLength; // 10920
      primitive.indicesComponentType; // 5123 USHORT
      primitive.mode; // 0 Point, 1 Line, 4 Triangle

      if(accessor.byteStride !== 0 && accessor.byteStride !== 6)
        console.error("ERRRRROR");

      const data = (primitive.indicesComponentType === 5123)? 
        new Uint16Array(accessor.bufferView.data, accessor.byteOffset, accessor.count) : 
        new Uint32Array(accessor.bufferView.data, accessor.byteOffset, accessor.count);
            
      r_mesh.indicesPerMaterial.push(Array.from(data).map(e => {return e + indexOffset}));
      //r_mesh.indicesPerMaterial.push(Array.from(data));
      if(primitive.material && primitive.material.pbrMetallicRoughness)
      {
        // TODO: FAST FIX. NEED TO BE FIXED IN A PROPER WAY
        let metallicRoughnessTextureIndex = -1;
        if(glTF.json.materials[primitive.material.materialID].pbrMetallicRoughness)
        {
          if(glTF.json.materials[primitive.material.materialID].pbrMetallicRoughness.metallicRoughnessTexture !== undefined)
          {
            const textureID = glTF.json.materials[primitive.material.materialID].pbrMetallicRoughness.metallicRoughnessTexture;
            metallicRoughnessTextureIndex = insertArray(r_mesh.materialTextureURLs, textureID);
          }
        }

        const pbr_mat = primitive.material.pbrMetallicRoughness;
        const baseColorTextureIndex = insertArray(r_mesh.materialTextureURLs, pbr_mat.baseColorTexture !== undefined? pbr_mat.baseColorTexture : null);
        //const metallicRoughnessTextureIndex = insertArray(r_mesh.materialTextureURLs, pbr_mat.metallicRoughnessTexture !== undefined? pbr_mat.metallicRoughnessTexture : null);
        const normalTextureIndex = insertArray(r_mesh.materialTextureURLs, pbr_mat.normalTexture !== undefined? pbr_mat.normalTexture : null);
        r_mesh.materials.push({
          type: MaterialType.CT_GGX,
          baseColor: pbr_mat.baseColorFactor,

          nIndex: 1.0,
          metallic: pbr_mat.metallicFactor,
          roughness: pbr_mat.roughnessFactor,
          reflectance: 0.5,

          baseColorTexture: baseColorTextureIndex,
          MetallicRoughnessTexture: metallicRoughnessTextureIndex,
          NormalsTexture: normalTextureIndex,
          UnusedTexture: -1
        });
      }
      else // default material
      {
        r_mesh.materials.push({
          type: MaterialType.CT_GGX,
          baseColor: [1, 1, 1, 1],

          nIndex: 1.0,
          metallic: 1.0,
          roughness: 1.0,
          reflectance: 0.5,

          baseColorTexture: -1,
          MetallicRoughnessTexture: -1,
          NormalsTexture: -1,
          UnusedTexture: -1
        });
      }
    }

    if(primitive.attributes.POSITION !== undefined) {
      const accessor = glTF.accessors[primitive.attributes.POSITION];
      const bv = accessor.bufferView;
      
      const stride = accessor.byteStride === 0 ? 3 : accessor.byteStride / 4; // stride in floats
      //console.log(accessor);
      const data = new Float32Array(bv.data, accessor.byteOffset, stride * (accessor.count - 1) + 3);
      
      if(model !== null)
      {
        let pos2 = glMatrix.vec3.create();
        for(let index = 0; index < accessor.count; index++)
        {
          //let pos = new Float32Array(data, stride * index * 4, 3);
          let pos = glMatrix.vec3.fromValues(data[stride * index + 0], data[stride * index + 1], data[stride * index + 2]);
          pos = glMatrix.vec3.transformMat4(pos2, pos, model);
          
          r_mesh.vertices.push(pos[0]);
          r_mesh.vertices.push(pos[1]);
          r_mesh.vertices.push(pos[2]);
        }
      }
      else if(accessor.byteStride !== 0 && accessor.byteStride !== 12)
      {
        for(let index = 0; index < accessor.count; index++)
        {
          r_mesh.vertices.push(data[stride * index + 0]);
          r_mesh.vertices.push(data[stride * index + 1]);
          r_mesh.vertices.push(data[stride * index + 2]);
        }
      }
      else
        r_mesh.vertices = r_mesh.vertices.concat(Array.from(data));
    }
          
    if(primitive.attributes.NORMAL !== undefined) {
      const accessor = glTF.accessors[primitive.attributes.NORMAL];
      const bv = accessor.bufferView;

      const stride = accessor.byteStride === 0 ? 3 : accessor.byteStride / 4;
      const data = new Float32Array(bv.data, accessor.byteOffset, stride * (accessor.count - 1) + 3);
      
      if(model !== null)
      {     
        let pos2 = glMatrix.vec3.create();
        for(let index = 0; index < accessor.count; index++)
        {
          //let pos = new Float32Array(data, stride * index * 4, 3);
          let pos = glMatrix.vec3.fromValues(data[stride * index + 0], data[stride * index + 1], data[stride * index + 2]);
          pos = glMatrix.vec3.transformMat3(pos2, pos, normalMatrix);
          
          r_mesh.vertexNormals.push(pos[0]);
          r_mesh.vertexNormals.push(pos[1]);
          r_mesh.vertexNormals.push(pos[2]);
        }
      }
      else if(accessor.byteStride !== 0 && accessor.byteStride !== 12)
      {        
        for(let index = 0; index < accessor.count; index++)
        {
          r_mesh.vertexNormals.push(data[stride * index + 0]);
          r_mesh.vertexNormals.push(data[stride * index + 1]);
          r_mesh.vertexNormals.push(data[stride * index + 2]);
        }
      }
      else
        r_mesh.vertexNormals = r_mesh.vertexNormals.concat(Array.from(data));        
    }

    if(primitive.attributes.TEXCOORD_0 !== undefined) 
    {
      const accessor = glTF.accessors[primitive.attributes.TEXCOORD_0];
      const bv = accessor.bufferView;

      const stride = accessor.byteStride === 0 ? 2 : accessor.byteStride / 4;
      const data = new Float32Array(bv.data, accessor.byteOffset, stride * (accessor.count - 1) + 2);
      if(accessor.byteStride !== 0 && accessor.byteStride !== 8)
      {        
        for(let index = 0; index < accessor.count; index++)
        {
          r_mesh.textures.push(data[stride * index + 0]);
          r_mesh.textures.push(data[stride * index + 1]);
        }
      }
      else
        r_mesh.textures = r_mesh.textures.concat(Array.from(data));
    }
  }
}

function webrays_load_gltf(url) 
{
  const _gltfLoader = new glTFLoader(null);

  const update = (resolve, reject) => {
    _gltfLoader.load_GLTF(url, glTF => {
      console.log("GLTF");
      console.log(glTF);
      let r_mesh = {
        vertices: [],
        vertexNormals: [],
        textures: [],
        indicesPerMaterial: [],
        materials: [],
        materialTextureURLs: []
      };

      let scene = glTF.defaultScene === undefined ? glTF.scenes[0] : glTF.scenes[glTF.defaultScene];
      // Get the First Scene TODO       

      for(let i = 0; i < scene.nodes.length; i++)
      {
        if(scene.nodes[i].mesh === null)
          webrays_gltf_load_nodes(glTF, r_mesh, scene.nodes[i]);
        else
          webrays_gltf_load_mesh(glTF, r_mesh, scene.nodes[i]);
      }

      //convert materials
      r_mesh.materials = r_mesh.materials.flatMap(e => [
        e.type, e.baseColor[0], e.baseColor[1], e.baseColor[2], 
        e.nIndex, e.metallic, e.roughness, e.reflectance,
        e.baseColorTexture, e.MetallicRoughnessTexture, e.NormalsTexture, e.UnusedTexture]);

      r_mesh.materialTextureURLs = [...new Set(r_mesh.materialTextureURLs)];
      r_mesh.materialTextureURLs = r_mesh.materialTextureURLs.map(e => glTF.images[e].currentSrc);
      /*for(let e of r_mesh.materialTextureURLs)
        e.style.transform = 'scaleY(-1)';*/
      r_mesh.flip_textures = false;
      
      resolve(r_mesh);
    }
  );
  }
  
  return new Promise(update);  
}