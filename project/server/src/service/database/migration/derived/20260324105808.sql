create index derived_device_manufacturer_idx on derived_device (manufacturer, id);
create index derived_device_model_idx on derived_device (model, id) where model is not null;
create index derived_device_model_id_idx on derived_device (model_id, id) where model_id is not null;
