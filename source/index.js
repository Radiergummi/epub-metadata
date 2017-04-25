'use strict';

/*
 global module,
 require
 */

const path       = require('path'),
      fsp        = require('fs-promise'),
      JsZip      = require('jszip'),
      xmlMapping = require('xml-mapping');

/**
 *
 * @param {string} key
 * @param {object} value
 * @returns {*}
 */
function cleanUpMetadata (key, value) {

  // Remove namespace part from keys
  if (typeof key === 'string' && /\$/.test(key)) {
    let newKey     = key.split('$')[ 1 ];
    this[ newKey ] = value;
    delete this[ key ];
    key = newKey;
  }

  // Make text property the actual value
  if (value.hasOwnProperty('$text') && Object.keys(value).length === 1) {
    this[ key ] = value.$text;
  }

  return value;
}

/**
 *
 * @param {object} json
 * @param {object} json.package
 * @param {object} json.package.metadata
 * @param metadata
 */
function loadDcMetadata (json, metadata) {
  for (let key in json.package.metadata) {
    if (!json.package.metadata.hasOwnProperty(key)) {
      continue;
    }

    if (key.search('dc') === 0) {
      !function() {
        let newKey         = key.replace(/^dc\$/, '');
        metadata[ newKey ] = json.package.metadata[ key ];
      }()
    }
  }
}

/**
 *
 * @param {object} json
 * @param {object} json.package
 * @param {object} json.package.metadata
 * @param {Array}  json.package.metadata.meta
 */
function rewriteMetaElements (json) {
  json.package.metadata.meta.forEach(meta => {
    json.package.metadata[ 'dc$' + meta.name ] = meta.content;
  });

  delete json.package.metadata.meta;
}

/**
 *
 * @param   {string} contentPath
 * @param   {string} coverId
 * @param   {object} json
 * @param   {object} json.package
 * @param   {object} json.package.manifest
 * @returns {string}
 */
function getCoverImagePath (contentPath, coverId, json) {
  let href = '';

  json.package.manifest.item.some(item => {
    if (item.id === coverId) {
      href = path.join(contentPath, '..', item.href);

      return true;
    }
  });

  return href;
}

/**
 *
 * @param   {string} epubPath
 * @returns {Promise.<object>}
 */
module.exports = function(epubPath) {
  return fsp
    .readFile(epubPath)
    .then(fileContent => {

      let epub         = new JsZip(fileContent),
          metadata     = {},
          contentPaths = [
            'content.opf',
            'OEBPS/content.opf'
          ],
          contentPath,
          json,
          xml;

      contentPaths.some(contentFilePath => {
        xml         = epub.file(contentFilePath);
        contentPath = contentFilePath;

        return Boolean(xml);
      });

      if (!xml) {
        throw new Error(`The software was not able to locate a content.opf file in ${epubPath}`);
      }

      json = xmlMapping.load(xml.asText(), {
        longTag: true
      });

      rewriteMetaElements(json);

      loadDcMetadata(json, metadata);

      // This is a little hack to iterate recursively over an object
      JSON.stringify(metadata, cleanUpMetadata);

      // Use keys for identifiers
      if (!Array.isArray(metadata.identifier)) {
        metadata.identifier = [ metadata.identifier ];
      }

      metadata.identifier.forEach(
        identifier => metadata[ identifier.scheme.toLowerCase() ] = identifier.text
      );

      delete metadata.identifier;

      metadata.coverPath = getCoverImagePath(
        contentPath,
        metadata.cover,
        json
      );

      return metadata;
    })
    .catch(error => console.error(error.stack));
};
