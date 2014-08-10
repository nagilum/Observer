/**
 * Implements jQuery.ready().
 */
$(document).ready(function () {
  $('a.create-new-token').click(function () { createNewTokenAndRedirect(); });
  $('a.edit-description').click(function () { replaceDescriptionWithTextbox($(this)); });
});

/**
 * Creates a new token and redirects to it.
 */
function createNewTokenAndRedirect() {
  $.ajax({
    type: 'POST',
    url: '/api/token',
    success: function (res) {
      if (res.token) {
        window.location = '/view/' + res.token;
      }
      else {
        alert('We received corrupt data from the server. Please try again later.');
      }
    },
    error: function () {
      alert('For some reason we were unable to contact the server and successfully create a new token. Please try again at a later time.');
    }
  });
}

/**
 * Replaces the description link with an editable textbox.
 *
 * @param obj $a
 *   The clicked link.
 */
function replaceDescriptionWithTextbox($a) {
  var $p = $a.parent(),
      $t = $('<input>')
             .attr('type', 'text')
             .attr('value', $a.attr('data-text')),
      $s = $('<input>')
             .attr('type', 'button')
             .attr('value', 'Save')
             .attr('data-token', $a.attr('data-token'))
             .click(function () {
               saveDescriptionAndReinsertLink($(this));
             });

  $a.remove();

  $p
    .append($t)
    .append($s);
}

/**
 * Saves the description on the token and reinserts the link.
 *
 * @param obj $b
 *   The clicked button.
 */
function saveDescriptionAndReinsertLink($b) {
  var token       = $b.attr('data-token'),
      $p          = $b.parent(),
      $t          = $p.find('input[type=text]'),
      description = $.trim($t.val()),
      $a          = $('<a>')
                      .attr('href', 'javascript:;')
                      .attr('data-text', description)
                      .attr('data-token', token)
                      .addClass('edit-description')
                      .addClass('no-link-faky')
                      .text((description === '' ? 'No description is set. Click to edit.' : description));

  $.ajax({
    type: 'PUT',
    url: '/api/token',
    data: {
      token: token,
      description: description
    },
    success: function (res) {
      $b.remove();
      $t.remove();

      $p.append($a);
    },
    error: function () {
      alert('Coult not save description!');
    }
  })
}
