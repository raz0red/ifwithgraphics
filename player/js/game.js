export var Game = (function () {
  var _id = null;

  function setId(id) { _id = id; }
  function getId()   { return _id; }

  return { setId: setId, getId: getId };
})();
