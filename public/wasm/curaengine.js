(function(root){
  root.CuraEngineWasmModule = root.CuraEngineWasmModule || {
    locateFile: function(file){
      return "/wasm/" + file;
    }
  };
})(typeof window !== "undefined" ? window : self);
