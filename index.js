"use strict"

var m = require('mithril')

module.exports = {
  h: m,
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
    m.render(
      root_node,
      render_view(render_model, signal)
    )
  }
  
  return render
}


function array(obj)
{
  return Array.prototype.slice.call(obj)
}

/**
 * An adapter for h() to make it work like mithril's m()
 */
function h(tag, attrs)
{
  var parsed = parse_tag(tag)
  var children = []
  
  if (attrs)
  {
    if (attrs.tagName || typeof attrs == "string")
    {
      children.push(attrs)
    }
    else if (attrs.constructor == Array)
    {
      children = unpack_children(attrs)
    }
    else
    {
      Object.assign(parsed.attrs, attrs)
    }
  }
  
  children = children.concat(
    unpack_children(Array.prototype.slice.call(arguments, 2))
  )
  
  return old_h(parsed.tag, parsed.attrs, children)
}

/* Based on https://github.com/lhorie/mithril.js/blob/next/mithril.js#L89 */
function parse_tag (tag)
{
  var classes = []
  var attrs = {}
  var parser = /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g
  var match
  var html_tag = 'div'
  
  while ((match = parser.exec(tag)))
  {
    if (match[1] === "" && match[2])
    {
      html_tag = match[2]
    }
    else if (match[1] === "#")
    {
      attrs.id = match[2]
    }
    else if (match[1] === ".")
    {
      classes.push(match[2])
    }
    else if (match[3][0] === "[")
    {
      var attrValue = match[6]
      if (attrValue)
      {
        attrValue = attrValue.replace(/\\(["'])/g, "$1")
      }
      attrs[match[4]] = attrValue || true
    }
  }
  
  if (classes.length > 0)
  {
    attrs.className = classes.join(' ')
  }
  
  return {
    tag: html_tag,
    attrs: attrs
  }
}

function unpack_children (children)
{
  var new_children = []
  children.forEach(function (c)
  {
    if (typeof c == "undefined" || c == "")
    {
      return
    }
    
    if (c.constructor == Array)
    {
      new_children = new_children.concat(unpack_children(c))
    }
    else
    {
      new_children.push(c)
    }
  })
  return new_children
}