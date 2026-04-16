* HA currently submits "model" / "sw_version" / "hw_version" / ... that do not follow submission protocol

  examples:
  * integral numbers / floating point numbers
  * arrays of strings / integral numbers / floating point numbers
  * objects (string keys, string / integral numbers / floating point numbers / array values)  
  
  if a data type that is not part of the specified set of types for that any particular field is encountered, it should be skipped when hashing, as [there](https://www.rfc-editor.org/rfc/rfc8259?utm_source=chatgpt.com#section-8) [be](https://www.rfc-editor.org/rfc/rfc8259?utm_source=chatgpt.com#section-6) [dragons](https://www.rfc-editor.org/rfc/rfc8259?utm_source=chatgpt.com#section-4)
  
* HA currently includes integration entities, even though the aren't consumed anymore  
  these should be skipped

* `None` / `null` values  
  should be skipped

* string encoding  
  should be encoded to utf-8 before hashing

* number encoding  
  as there are no fields with floating point values in the submission protocol, we only need to be concerned about integers (and only in reasonable positive ranges, as they are only used for "via_device" links)  
  should be coerced to a utf-8 encoded string, as converting integers to bytes is pretty cumbersome in js

* boolean encoding  
  should be coerced to either "true" or "false" utf-8 string

* ordering  
  dragon taming required, see implementation
  while reordering is not necessary for new submissions, it sadly is for deriving the hash of old ones, as sqlite make no guarantee of record order

* identical hashing function  
  while md5 would be totally sufficient here, use sha256 to prevent unnecessary discussions

* digest encoding
  `.hexdigest()` should be used in python, `.toString("hex")` in js
