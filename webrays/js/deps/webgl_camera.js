"use strict";

class SimplePerspectiveCamera
{
  constructor(canvas)
  {
    // Camera Properties
    this.width          = canvas.width;
    this.height         = canvas.height;
    this.field_of_view  = 60.0;
    this.zNear          = 0.1;
    this.zFar           = 100.0;
    this.camera_pos     = glMatrix.vec3.fromValues(0.0, 0.0, -5.0);
    this.camera_target  = glMatrix.vec3.fromValues(0.0, 0.0,  0.0);
    this.camera_front   = glMatrix.vec3.sub(glMatrix.vec3.create(), this.camera_target, this.camera_pos);
    let  length         = glMatrix.vec3.length(this.camera_front);
    this.camera_front   = glMatrix.vec3.normalize(this.camera_front, this.camera_front);
    this.camera_up      = glMatrix.vec3.fromValues(0.0, 1.0, 0.0);

    this.set_size(canvas.width, canvas.height);
    this.recompute_view_matrix();
  }

  recompute_perspective_matrix() 
  {
    this.projection = glMatrix.mat4.perspective(glMatrix.mat4.create(),
                                                glMatrix.glMatrix.toRadian(this.field_of_view),
                                                this.aspect_ratio,
                                                this.zNear,
                                                this.zFar);
  }

  recompute_view_matrix()
  {
    // View Matrix
    this.view = glMatrix.mat4.lookAt(glMatrix.mat4.create(),
                                     this.camera_pos,
                                     this.camera_target,
                                     this.camera_up
    ); 

    // Decode Camera View Axis
    this.camera_right = glMatrix.vec3.fromValues(  this.view[0],  this.view[4],  this.view[8]  );
    this.camera_up    = glMatrix.vec3.fromValues(  this.view[1],  this.view[5],  this.view[9]  );
    this.camera_front = glMatrix.vec3.fromValues( -this.view[2], -this.view[6], -this.view[10] );
  }

  set_size(width, height)
  {
    this.width        = width;
    this.height       = height;
    this.aspect_ratio = width / height;

    this.recompute_perspective_matrix();
  }
}