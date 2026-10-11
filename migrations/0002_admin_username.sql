ALTER TABLE users ADD COLUMN username varchar(80);
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
