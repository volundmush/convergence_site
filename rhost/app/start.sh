#! /bin/sh
mkdir /rhost
cd /rhost
git clone https://github.com/RhostMUSH/trunk.git .
cd Server
cp /app/asksource.save_default bin/
cp -r /app/data/*.conf game/
cp -r /app/data/txt/* game/txt/
make default
make links
cd game
echo "Y\nY\n/app/data/data/netrhost.db.flat\n" | ./Startmush
tail -f netrhost.log
