"use strict"

var InfernoDOM = require('inferno-dom')

module.exports = {
  h: require('inferno-create-element'),
  mount: mount
}

function mount (node, model, view, channels)
{
  var get_model = function () { return model }
  var set_model = function (x) {
    model = x
    render(model, view)
  }
  var signal = create_signal(get_model, set_model)
  var render = create_render(node, signal)
  render(model, view)
  
  channels.forEach(function (x)
  {
    x(signal)
  })
}


/**
 * Creates a signal.
 * 
 * Signals map actions to models. The generated signal is a function that
 * takes an action and creates a function that executes the action,
 * updating the model the signal is mapped to.
 * 
 *    var model = 0
 *    var inc = function (model) { return model + 1 }
 *    var signal = create_signal(model)
 *    var inc_signal = signal(inc)
 *    inc_signal()
 *    model == 1 // true
 * 
 * The signal has a map() function that will create a new signal function that is mapped
 * to a property of the parent signal's model.
 *
 *    var model = { counter: 0 }
 *    var inc = function (model) { return model + 1 }
 *    var signal = create_signal(model)
 *    var inc_signal = signal.map('counter')
 *    inc_signal()
 *    model == { counter: 1 } // true
 */
function create_signal (getter, setter)
{
  function signal ()
  {
    var signal_args = parse_signal_arguments(arguments)
    return function ()
    {
      setter(
        signal_args.action.apply(null, 
          [getter()].concat(signal_args.args, array(arguments))
        )
      )
    }
  }
  
  signal.map = map_signal.bind(null, signal)
  signal.task = task.bind(null, signal)
  
  return signal
}

function map_signal (signal, key)
{
  var mapped_signal = function ()
  {
    var signal_args = parse_signal_arguments(arguments)
    return signal(function ()
    {
      var model = arguments[0]
      var args = [model[key]]
        .concat(signal_args.args)
        .concat(Array.prototype.slice.call(arguments, 1))
      var update = {}
      update[key] = signal_args.action.apply(null, args)
      return Object.assign({}, model, update)
    })
  }
  mapped_signal.map = function (key)
  {
    return map_signal(mapped_signal, key)
  }
  mapped_signal.task = task.bind(null, mapped_signal)
  return mapped_signal
}

function parse_signal_arguments (args)
{
  return {
    action: args[0],
    args: Array.prototype.slice.call(args, 1)
  }
}

/**
 * Executes an asynchronous command and signals either a succeed 
 * or fail action.
 *
var model = 0
var signal = create_signal(model)
var add = function (model, amount) { return model + amount }
var get_amount = function (callback) {
  setTimeout(function ()
  {
    callback(null, 5)
  }, 1000)
}
exec(signal, get_amount, add, null, function ()
{
  model == 5 // true
})
*/
function task (signal, command, succeed_action, fail_action, callback)
{
  var succeed = signal(succeed_action)
  var fail = signal(fail_action)
  var local_callback = function (err, result)
  {
    if (err)
    {
      fail(err)
    }
    else
    {
      succeed(result)
    }
    if (callback)
    {
      callback(err, result)
    }
  }
  
  return function ()
  {
    var result = command(local_callback)
    
    if (typeof result != "undefined")
    {
      if (result.then && result.catch)
      {
        result
          .then(local_callback.bind(null, null))
          .catch(local_callback.bind(null))
      }
      else
      {
        throw new Error ("Command promises must support then() and catch()")
      }
    }
  }
}

/*
 * Renders a view into a DOM node
 */
function create_render (root_node, signal)
{
  var render_model = null
  var render_view = null
  var pending = false
  
  function render (model, view)
  {
    render_model = model
    render_view = view
    
    if (pending)
    {
      return
    }
    else
    {
      pending = true
      requestAnimationFrame(_render)
    }
  }

  function _render ()
  {
    pending = false
    InfernoDOM.render(
      render_view(render_model, signal),
      root_node
    )
  }
  
  return render
}


function array(obj)
{
  return Array.prototype.slice.call(obj)
}