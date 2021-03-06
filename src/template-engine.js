
var Hogan = require('hogan.js');
var ReadDir = require('readdir');
var Path = require('path');
var FS = require('fs');
var debug = require('debug')('hogan');

function TemplateEngine(settings) {
   if (settings) {
      Object.keys(settings).forEach(function (key) {
         if (TemplateEngine.__settings.hasOwnProperty(key)) {
            TemplateEngine.__settings[key] = settings[key];
         }
         else {
            throw "hogan-middleware: unknown setting, attempted to set value for " + key;
         }
      });
   }
   return TemplateEngine;
}

TemplateEngine.__settings = {
   filter: ['**.mustache'],
   flatten: true,
   watch: true
};

/**
 * All active directory file system watches
 * @type {fs.FSWatcher[]}
 * @ignore
 */
TemplateEngine._watches = [];

/**
 * Called by the express server to get the content for a given template at the templatePath supplied. The templateData
 * can contain any content from a configured route, and will be made available to the templates.
 *
 * Templates can include partials by name for any template also in the views directory, note that if sub-directories are
 * used to create included partials, express will not necessarily recognise that file as a valid view path... you've been
 * warned.
 *
 * @param {String} templatePath Path to the template
 * @param {Object} templateData Data to give to the template
 * @param {Function} next Callback to receive two arguments, an error object and the template result.
 */
TemplateEngine.__express = function(templatePath, templateData, next) {
   var templateName = Path.basename(templatePath, Path.extname(templatePath));
   var templates = TemplateEngine._getTemplates(templateData.settings.views);
   var output = null, error = null;

   try {
      output = templates[templateName].render(templateData, templates);
   }
   catch (e) {
      error = e;
   }
   finally {
      next(error, output);
   }
};

/**
 * Gets all templates, when the template path hasn't yet been scanned it will be read synchronously to ensure there are
 * always templates available, the template directory is then watched to allow templates to be changed while the server
 * is still running.
 *
 * @param {String} templatesPath
 */
TemplateEngine._getTemplates = function(templatesPath) {
   if(!TemplateEngine.__templates) {
      TemplateEngine._refreshTemplates(templatesPath);
      FS.watch(
         templatesPath,
         {
            persistent: false
         },
         function refreshTemplates (a,b,c) {
            return TemplateEngine._refreshTemplates(templatesPath);
         }
      );
   }
   return TemplateEngine.__templates;
};

/**
 * Refresh all directory watches
 * @param {String} templatesPath
 */
TemplateEngine._refreshWatches = function(templatesPath) {
   if (TemplateEngine.__settings.watch === false) {
      debug('Refreshing watched directories has been disabled.');
      return;
   }

   debug('Refreshing watched directories');

   // Remove any existing watches
   TemplateEngine._watches.splice(0).forEach(function(watch) {
      watch.close();
   });

   ReadDir.readSync(templatesPath, ['**/'], ReadDir.ABSOLUTE_PATHS + ReadDir.INCLUDE_DIRECTORIES)
      .forEach(function (path) {
         debug(' [WATCH] %s', path);
         TemplateEngine._watches.push(
            FS.watch(path, {persistent:false}, TemplateEngine._refreshTemplates.bind(TemplateEngine, templatesPath))
         );
      });
};

/**
 * Reads all templates in the supplied path (synchronously). Can be called at any time, and is used as the handler for
 * the file system watch of the templates directory.
 *
 * @param {String} templateRootPath
 */
TemplateEngine._refreshTemplates = function(templateRootPath) {
   debug('Refreshing templates for %s', templateRootPath);

   TemplateEngine._refreshWatches(templateRootPath);

   var settings = TemplateEngine.__settings;

   findTemplates(templateRootPath, settings.filter)
      .map(readTemplate)
      .reduce(function (templates, template) {

         if (settings.flatten) {
            templates[Path.basename(template.path)] = template.content;
         }

         templates[Path.relative(templateRootPath, template.path)] = template.content;

         return templates;

      }, TemplateEngine.__templates = {});

   debug('Refreshing templates complete');
};

function findTemplates (rootPath, filter) {
   return ReadDir.readSync(rootPath, filter, ReadDir.ABSOLUTE_PATHS);
}

function readTemplate (absolutePath) {
   return {
      content: Hogan.compile(FS.readFileSync(absolutePath, 'utf-8')),
      path: stripFileExtension(absolutePath)
   };
}

function stripFileExtension (input) {
   return input.replace(/(.+)\.[a-z]+/, '$1');
}


module.exports = TemplateEngine;
