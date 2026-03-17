$(function () {
  var inventory = {};
  var inv_global = {};
  var global_vars = {
    playing: true,
    cloak_status: false,
    cat_mad: true,
    cook_status: true,
    pepper: false,
    onion: false,
    flagon: false,
    robert: false,
    kill_assassin: false,
    robert_note: false,
    robert_leave: false,
    assassin_attack: false,
    note_guard: false,
    brood: true,
    have_knife: false,
    robert_scroll: false,
    recover_room: false,
  };

  //verb functions ---------------------------

  var to_print = function (printthis) {
    jqconsole.Write(printthis + "\n", "jqconsole-output");
  };

  var help = function () {
    to_print(
      "\ninv = view inventory \nlook = look around the area \nlook [object] = look at an object in the room or your inventory \ntake [object] = pick up item \nuse [item] = use an item from your inventory on yourself \nuse [item] [object] = use an item from your inventory on an object \ngo [north/south/east/west] = go to adjacent area \ntalk [person] = talk to a person in the room",
    );
  };

  var setup_room = function (room) {
    for (item in room[2]) {
      if (item in inv_global) {
        room[1][item] = "";
        room[2][item] = "";
      }
    }
    for (action in global_actions) {
      room[5][action] = global_actions[action];
    }
    return room;
  };

  var look = function (action, room) {
    if (action.length > 1) {
      look_item(action[1] === "at" ? action[2] : action[1], room);
    } else {
      look_room(room);
    }
  };

  var go_to = function (direction, room) {
    if (direction in room[6]) {
      if (typeof room[6][direction] === "function") {
        return room[6][direction];
      } else {
        to_print(room[6][direction]);
        return room;
      }
    } else {
      to_print("You cannot go in that direction.");
      return room;
    }
  };

  var look_item = function (item, room) {
    var templist = {};
    for (key in inventory) {
      templist[key] = true;
      if (key == item) {
        to_print(inventory[key]);
        break;
      }
    }
    for (key in room[2]) {
      templist[key] = true;
      if (key == item) {
        to_print(room[2][key]);
        break;
      }
    }
    for (key in room[3]) {
      templist[key] = true;
      if (key == item) {
        to_print(room[3][key]);
        break;
      }
    }
    if (!(item in templist)) {
      to_print("You see nothing interesting about it.");
    }
  };

  var look_room = function (room) {
    to_print("\n");
    to_print(room[0]);
    for (item in room[1]) {
      to_print(room[1][item]);
    }
  };

  var take = function (item, room) {
    if (!(item in inv_global)) {
      var templist = {};
      for (key in inventory) {
        if (key === item) {
          to_print("You already took the " + item + ".");
          return room;
        }
      }
      for (key in room[2]) {
        templist[key] = true;
        if (key === item) {
          to_print("You take the " + item + ".");
          inventory[key] = room[2][key];
          inv_global[key] = true;
          room[2][key] = "";
          room[1][key] = "";
          return room;
        }
      }
      if (!(item in templist)) {
        to_print("That would be useless to you.");
        return room;
      }
    } else {
      to_print("You already took the " + item + ".");
      return room;
    }
  };

  var use_item = function (item) {
    if (item in inventory) {
      return item;
    } else {
      to_print("You do not have a " + item);
    }
  };

  var get_inv = function () {
    for (key in inventory) {
      to_print(key);
    }
  };

  var talk = function (person, room) {
    var templist = {};
    for (key in room[4]) {
      templist[key] = true;
      if (key === person) {
        if (typeof room[4][key] === "string") {
          to_print(room[4][key]);
        } else {
          room[4][key];
        }
      }
    }
    if (!(person in templist)) {
      to_print(person + " is not here.");
    }
  };

  var use = function (actions, room) {
    templist = {};
    if (actions.length === 3) {
      action_string = use_item(actions[1]) + "-" + actions[2];
    } else if (actions.length == 2) {
      action_string = use_item(actions[1]);
    }
    for (key in room[5]) {
      templist[key] = true;
      if (key == action_string) {
        if (typeof room[5][key] === "string") {
          to_print(room[5][key]);
        } else {
          console.log("using item...");
          room[5][key](use_item(actions[1]));
        }
      }
    }
    if (!(action_string in templist)) {
      to_print("That would do no good.");
    }
  };

  var use_cloak = function (cloak) {
    if (global_vars["cloak_status"]) {
      to_print("You remove your cloak.");
      global_vars["cloak_status"] = false;
    } else {
      to_print("You put on your cloak.");
      global_vars["cloak_status"] = true;
    }
  };

  //Plot actions --------------------------------------------------------

  var cat_flower = function (flower) {
    global_vars["cat_mad"] = false;
    delete inventory["flower"];
    delete inv_global["flower"];
    to_print(
      "Catelyn's face softens. \"Oh, Ned.\"\nYou take her in your arms and say, \"I would not have chosen this 'honor'.\nBut I cannot deny Robert, and we will make do in King's Landing.\"",
    );
    to_print(
      '\n"I know," she says," I do not know why I feel this terrible sense of dread. \nBut thank you, I feel much better now."',
    );
  };

  var flagon = function (flagon) {
    if (global_vars["onion"] && global_vars["pepper"]) {
      to_print("You fill the flagon with your much improved soup.");
      global_vars["flagon"] = true;
      inventory["flagon"] = "The flagon is full of soup.";
    } else {
      to_print("The soup is not worth taking yet.");
    }
  };

  var flagon_robert = function (flagon) {
    if (global_vars["flagon"]) {
      to_print(
        'You give the flagon of much improved soup to Robert.\n"Maybe I was wrong about you Northerners, Ned, this does warm the belly! \nThough I\'d rather the flagon be filled with ale! Hah!" \n\n He remembers something and his face becomes serious. \n"Why don\'t you meet me in the crypts? I\'d like to say farewell to Lyanna befoe we go."',
      );
      delete inventory["flagon"];
      global_vars["robert"] = true;
    } else {
      to_print('"You know better than to offer me an empty flagon, Ned!"');
    }
  };

  var note_guard = function (note) {
    global_vars["note_guard"] = true;
    to_print(
      'You show Robert\'s note to the guard.\n"Hmmm King Robert has granted you his command, eh? And this IS his seal. Very well, enter."\nThe guard gives you a sideways glance and steps aside.',
    );
  };

  var soup_ingredient = function (ingred) {
    delete inventory[ingred];
    global_vars[ingred] = true;
    if (global_vars["onion"] && global_vars["pepper"]) {
      to_print('"Now the soup should be fit for a king."');
    } else {
      to_print(
        '"This ' + ingred + ' should make the soup taste a little better."',
      );
    }
  };

  var knife_robert = function (knife) {
    to_print(
      'You show Robert the assassin\'s knife that bears his family crest.\nRecognition flashes across his eyes. "Where\'d you get this?" He demands.\n"A man tried to kill me with it," you reply, "somebody close to you must object to my ascension to Hand."\nRobert scowls. He seems to sober a bit.\n"I must alert King\'s Landing. We\'ll send a message at once. "\n\nRobert walks to the table and scribbles a note on a small scroll.\nHe rolls it tight, stamps his seal in wax, and hands it to you.\n"Move quickly, and be alert."',
    );
    global_vars["robert_scroll"] = true;
    inventory["scroll"] =
      "The small scroll Robert gave you. You will not betray his trust by opening it.";
    inv_global["scroll"] = true;
  };

  var scroll_raven = function (scroll) {
    to_print(
      "You carefully tie the scroll around the raven's leg.\n\nThe bird flies from the window, then over the wall and above the woods beyond.\nIts wings beat a slow rhythm into the midday sky. \n\nAnd then, with a jolt, it begins to fall.\nThe raven tumbles through the air in a lopsided spiral, orbiting the end of an arrow.\n\nYou whisper a prayer.\n\n.___..__.  .__ .___   __ .__..  ..___.._..  ..  ..___.__          \n  |  |  |  [__)[__   /  `|  ||\\ |  |   | |\\ ||  |[__ |  \\         \n  |  |__|  [__)[___  \\__.|__|| \\|  |  _|_| \\||__|[___|__/ *  *  *",
    );
    global_vars["playing"] = false;
  };

  var update_room = function (room) {
    if (room[7]["name"] === "godswood") {
      if (global_vars["robert_note"]) {
        room[6]["south"] = godswood_south;
      } else {
        room[6]["south"] = "You have no desire to go deeper into the godswood.";
      }
    }

    if (room[7]["name"] === "godswood_south") {
    } else if (room[7]["name"] === "hall") {
      if (global_vars["robert_leave"]) {
        room[1]["robert"] = "";
        room[3]["robert"] = "";
        room[4]["robert"] = "Robert is not here.";
      }
      if (global_vars["robert"] && global_vars["robert_leave"] === false) {
        room[4]["robert"] =
          '"Thanks for the much improved soup, Ned. \nSee you in the Crypts."';
      }
    } else if (room[7]["name"] === "kitchen") {
      if (global_vars["onion"] && global_vars["pepper"]) {
        room[3]["soup"] = "The soup smells delicious now!";
        room[3]["pot"] = "The soup smells delicious now!";
      }
    } else if (room[7]["name"] == "north_gate") {
      if (global_vars["note_guard"]) {
        room[4]["guard"] = '"At your command, Lord Stark."';
        room[6]["east"] = room_robert;
      } else {
        room[6]["east"] =
          "The guard stops you. \"Sorry m'lord. I can't let you through. King's own orders.\"";
      }
    } else if (room[7]["name"] === "room_robert") {
      if (global_vars["assassin_attack"]) {
        room[4]["robert"] =
          'You tell the king about the assassin in the godswood. \n"I\'d have thought your castle to be safer, Ned.\nNow let me drink in peace."';
      }
      if (global_vars["robert_scroll"]) {
        room[0] =
          "Robert sits at the table, writing a letter. \n You see the North Gate through his open door to the WEST.";
        room[4]["robert"] = '"There\'s no time to talk, Ned. Move."';
      }
    } else if (room[7]["name"] === "yard") {
      if (global_vars["cloak_status"] === false) {
        room[6]["west"] =
          "You begin to descend the dark stairs, but the cold bites you to the bone. You turn back towards the yard.";
      } else if (global_vars["cloak_status"]) {
        room[6]["west"] = crypts;
      }
      if (global_vars["robert"] && global_vars["cloak_status"]) {
        room[6]["west"] = crypts_robert;
      }
    }

    if ("note" in inventory) {
      global_vars["robert_note"] = true;
    }

    return room;
  };

  var test_action = function (action, room) {
    if (room[7]["name"] === "godswood_south" && !global_vars["kill_assassin"]) {
      if (action[0] == "use" && use_item(action[1]) == "dirk") {
        to_print(
          'You duck to the side and plunge your blade deep between the man\'s ribs.\nHe utters a quick gasp, drops his knife, and falls at your feet, dead.\n"I must warn Catelyn," you think as you pull your red blade from his torso.',
        );
        global_vars["kill_assassin"] = true;
        return loop(room);
      } else {
        to_print(
          "You catch the man's wrist before he can cut you, but he is stronger than you are. \nHe strikes you in the jaw with his other hand, you hear men shouting as darkness swirls around you...",
        );
        return ["go", "fail"];
      }
    }
    if (action[1] === "flowers") {
      action[1] = "flower";
    }
    if (action[1] === "onions") {
      action[1] = "onion";
    }
    return action;
  };

  //ROOMS ------------------------------------------------------------

  var chambers = function () {
    to_print("\nBEDCHAMBER:\nYou are in your chambers.");
    var room = [
      "Catelyn sits near the hearth, gazing into the fire.\nA window overlooks the yard below. You hear faint voices outside.\nA spiral staircase descends to the EAST.\nYour door opens NORTH.",
      { cloak: "Your cloak hangs on the door." },
      { cloak: "Your warm fur cloak has seen you through many winters." },
      {
        window:
          "In the yard below, your sons shoot arrows at a straw man. You chuckle as Bran misses wide.",
        catelyn: "Catelyn sighs and continues to stare into the fire.",
        fire: "You stare into the flames ... and see nothing.",
        hearth: "A small fire crackles in the hearth.",
      },
      {
        catelyn:
          '"I must serve my king, it is my duty," you say. She replies, "Yes, but what of your family?".',
        bran: "You yell a word of encouragement out the window. Bran looks up at you and smiles. Then misses again.",
      },
      {
        "dirk-catelyn": "A dark thought passes through your mind.  But no...",
        "cloak-catelyn": '"It\'s warm enough in here already, Ned."',
        "onion-catelyn": '"You know I despise the tast of onions."',
        "potato-catelyn": '"I\'m not hungry, Ned"',
        "flower-catelyn": cat_flower,
      },
      { east: glass_gardens, north: hallway },
      { name: "chambers" },
    ];
    room = setup_room(room);
    if (global_vars["brood"]) {
      to_print("Catelyn broods near the fire.");
      global_vars["brood"] = false;
    }
    if (global_vars["cat_mad"] === false) {
      room[4]["catelyn"] =
        '"I love you, Ned, but I still feel something is amiss."';
    }
    if (global_vars["assassin_attack"]) {
      room[4]["catelyn"] =
        '"I had a feeling something terrible was coming. \nI know Robert loves you, but we cannot trust the rest of these Southerners. \nYou must warn him of this treason, and you must be sure he believes you."';
      room[5]["knife-catelyn"] =
        '"This is evidence enough that Robert\'s men have conspired against you. You must tell him at once."';
    }
    return room;
  };

  var chambers_recover = function () {
    to_print("\nBEDCHAMBER:\n...Your eyes open and adjust to the light.");
    var room = [
      "Catelyn sits at the side of the bed, her hands around yours.\nA window overlooks the yard below. You hear faint voices outside.\nA hallway leads NORTH. A spiral staircase descends to the EAST.",
      { cloak: "Your cloak hangs on the door." },
      { cloak: "Your warm fur cloak has seen you through many winters." },
      {
        window:
          "In the yard below, your sons shoot arrows at a straw man. You chuckle as Bran misses wide.",
        table: "The table is sturdy. Winterfell's craftsmen are skilled.",
        catelyn: "Catelyn sighs and continues to stare into the fire.",
        fire: "You stare into the flames ... and see nothing.",
        hearth: "A small fire crackles in the hearth.",
        east: "A spiral staircase descends to your EAST.",
      },
      {
        catelyn: 'Go find the responsible party Ned, but please be safe.".',
        bran: "You yell a word of encouragement out the window. Bran looks up at you and smiles. Then misses again.",
      },
      {
        "dirk-catelyn": "A dark thought passes through your mind.  But no...",
        "cloak-catelyn": '"It\'s warm enough in here already, Ned."',
        "onion-catelyn": '"You know I despise the tast of onions."',
        "flower-catelyn": cat_flower,
      },
      { north: hallway, east: glass_gardens },
      { name: "chambers_recover" },
    ];
    room = setup_room(room);
    if (global_vars["recover_room"] === false) {
      global_vars["recover_room"] = true;
      to_print(
        '"You were nearly killed, Ned.", Catelyn tells you. \n"One of our men heard the struggle and came running, but the man escaped into the woods.  \nDid you know the man who attacked you?"\n\n"I may have seen him in the Great Hall, I have no evidence it was one of Robert\'s men. \nBesides, Robert would not have traveled so far only to kill me."\n\n"Robert is a fool." Whispers Catelyn sharply. "He wants nothing more than to eat, drink, and be merry.\nHe would never know if there were turncloaks within his party, though his blindness would be of little comfort if you were to die.\nYou must find who is responsible. We are not safe here."',
      );
    } else {
      to_print(
        'Catelyn sits near the bed. "Perhaps you should arm yourself, Ned.", she tells you.',
      );
    }
    return room;
  };

  var crypts = function () {
    to_print(
      "\nCRYPTS:\nYou descend into Winterfell's frigid crypts to consult your elders.",
    );
    var room = [
      "Your breath wisps white in front of your face, although it is so dark you can barely see it.\nYou pause in front of your brother Brandon's tomb.\nYour sister Lyanna and father Rickard lay beside him.\nStatues of the three stand vigil over their tombs. \nFaint light comes from the EAST.",
      {},
      {},
      {
        statue:
          "Statues of your deceased family stand vigil over their remains.",
        tomb: "Your family rests in their rough granite tombs.",
        tombs: "Your family rests in their rough granite tombs.",
        brandon:
          "A stone statue of your brother Brandon peers off into the darkness.",
        lyanna: "You see much of Lyanna in your daughter Arya",
        rickard: "Your father was a hard man, but just.",
      },
      {
        brandon: '"I think of you every day, brother"',
        lyanna: '"I have not forgotten my promise, sister."',
        rickard: '"How I wish you were here to guide me, father."',
      },
      {},
      { east: yard },
      { name: "crypts" },
    ];
    room = setup_room(room);
    room[5]["cloak"] = "It is too cold in the crypts to remove your cloak.";
    return room;
  };

  var crypts_robert = function () {
    to_print("\nCRYPTS:\nYou descend into the crypts.");
    var room = [
      "Your breath wisps white in front of your face, although it is so dark you can barely see it.\nStatues of your sister Lyanna, your brother Brandon, and your father Rickard stand vigil over their tombs. \nFaint light comes from the EAST.",
      { note: "Robert's note lies folded at Lyanna's feet." },
      {
        note: 'The note says "My voice is yours, beloved Stark." The royal seal is embossed on the paper.',
      },
      {
        statue:
          "Statues of your deceased family stand vigil over their remains.",
        tomb: "Your family rests in their rough granite tombs.",
        brandon:
          "A stone statue of your brother Brandon peers off into the darkness.",
        lyanna: "You see much of Lyanna in your daughter Arya",
        rickard: "Your father was a hard man, but just.",
      },
      {
        brandon: '"I think of you every day, brother"',
        lyanna: '"I have not forgotten my promise, sister."',
        rickard: '"How I wish you were here to guide me, father."',
      },
      { dirk: '"You\'ll join your ancestors soon enough."' },
      { east: yard },
      { name: "crypts_robert" },
    ];
    room = setup_room(room);
    room[5]["cloak"] = "It is too cold in the crypts to remove your cloak.";

    if (!global_vars["robert_leave"]) {
      to_print(
        'Robert\'s large frame is outlined at the far end of the dark room.\nHe stands in front of Lyanna\'s tomb, head bowed.\n"What good is power if you have nothing to fight for, Ned?" he asks as you join him in front of your sister\'s statue.\n\nYou have no answer.\n\n"May the Seven guide her, wherever she may be." Robert adds.\n"Lyanna was of the North, she kept the old gods." you remind him.\n"Old, new, bugger them all. Go into your woods and pray to your rocks and sticks and trees then."\nRobert places a note at Lyanna\'s feet, rests his hand on your shoulder for a moment, then leaves.',
      );
    }
    global_vars["robert_leave"] = true;
    return room;
  };

  var glass_gardens = function () {
    to_print(
      "\nGLASS GARDENS: \nYou enter the glass gardens and fill your lungs with humid air.",
    );
    var room = [
      "Light streams through the large windows that enclose the glass gardens.\nCatelyn has planted flowers in one corner.  She says they remind her of Riverrun.\nThey were meant to be red but grow pale in Winterfell's thin soil.\nOnion plants fill the rest of the garden plots.\nA spiral staircase winds upwards to the WEST.\nA stained glass door leads to the SOUTH.",
      { flower: "", onion: "" },
      {
        flower: "The flowers in Winterfell grow pale as snow.",
        onion:
          "Winterfell's onions are full of flavor. Sometimes you like to eat them raw.",
      },
      {
        out: "You see the wall of the keep, and beyond that, the tops of the trees in the godswood.",
        glass: "It is made in Myr and is not cheap.",
        west: "The spiral staircase to the WEST ascends steeply.",
      },
      { "": "" },
      {
        cloak: use_cloak,
        onion:
          "You are not hungry. Besides, you have a feeling you'll need it later.",
      },
      { west: chambers, south: yard },
      { name: "glass_gardens" },
    ];
    room = setup_room(room);
    if (global_vars["cat_mad"]) {
      room[6]["south"] =
        "You should not stray too far from your wife while she is upset.";
    }
    return room;
  };

  var godswood = function () {
    to_print(
      "\nGODSWOOD:\n You enter a clearing in the godswood and kneel before the heart tree.",
    );
    var room = [
      "Cool light filters through the red leaves of the weirwood trees.\nThe godswood extends all the way to the south end of Winterfell.\nA pond spreads out in front of the heart tree, filled with black water.\nA stone archway leads NORTH to the yard.",
      { "": "" },
      { "": "" },
      {
        pond: "Its waters are deep and black.",
        tree: "The heart tree is sacred to the Northerners.",
      },
      { "": "" },
      {
        "flagon-water": "You don't need any water.",
        "flagon-pond": "You don't need any water.",
      },
      { north: yard, south: "godswood south" },
      { name: "godswood" },
    ];
    room = setup_room(room);
    if (global_vars["kill_assassin"] == false && global_vars["robert_note"]) {
      to_print("You hear a twig snap to the SOUTH.");
    }
    return room;
  };

  var godswood_south = function () {
    to_print("\nGODSWOOD:\n You walk deeper into the Godswood.");
    var room = [
      "The woods are thick and full of brambles.\nA clearing opens to the NORTH.",
      {
        knife:
          "A knife lies next to the assassin's body. King Robert's family crest is engraved on the hilt.",
      },
      { knife: "King Robert's family crest is engraved on the hilt." },
      {},
      {},
      {},
      { north: godswood, fail: chambers_recover },
      { name: "godswood_south" },
    ];
    room = setup_room(room);

    if (global_vars["kill_assassin"] === false) {
      to_print("A man lunges out from behind a tree, drawing a blade.");
      global_vars["assassin_attack"] = true;
    }
    return room;
  };

  var hall = function () {
    to_print("\nGREAT HALL:\n You enter the Great Hall.");
    var room = [
      "The Great Hall of Winterfell is filled with Robert's men, impatiently waiting to be fed.\nThe air is hot and damp, and ripe with the stench of unwashed bodies.\nA heavy wooden door leads WEST to the yard.\nA swinging door leads NORTH.",
      {
        robert: "Robert sits at the dais.",
        flagon: "An empty flagon sits unused on a table.",
      },
      { flagon: "It's an empty wine flagon." },
      {
        soup: "The soup DOES look pretty thin",
        robert:
          "Robert takes a long swig of wine, then leans over and says something to one of his men. They both laugh.",
        men: "The men toss rude insults at one another. \nThey quiet a bit as you approach.",
      },
      {
        robert:
          '"You Northerners wouldn\'t know a good soup if it bit your frozen ass!" chides Robert. \n"This swill is piss thin and bland as a farmer\'s daughter! \n I\'m not moving until I get a hearty meal in my belly."',
        men: '"We thank you for your hopsitality, m\'lord.  But the soup could use some spice."',
      },
      {
        "flagon-robert": flagon_robert,
        "soup-robert": flagon_robert,
        "dirk-men":
          "You do not think the odds of that fight are in your favor.",
        "dirk-robert": "You do not feel like commiting regicide today.",
      },
      { north: kitchen, west: yard },
      { name: "hall" },
    ];
    room = setup_room(room);
    if (global_vars["robert_leave"]) {
      room[1]["robert"] = "";
      room[3]["robert"] = "";
      room[4]["robert"] = "Robert is not here.";
    }
    if (global_vars["cook_status"]) {
      to_print(
        'As you walk through doorway, Gage, your head cook, storms out. \n"I quit, Lord Stark!" he hisses at you, "There is no pleasing these Southron bastards!"',
      );
      global_vars["cook_status"] = false;
    }
    if (global_vars["robert"] && global_vars["robert_leave"] === false) {
      room[4]["robert"] =
        '"Thanks for the much improved soup, Ned. \nSee you in the Crypts."';
    }
    return room;
  };

  var hallway = function () {
    var room = [
      "The stone hallway snakes through your quarters.\nYour daughter Arya's room branches off to the WEST.\nA staircase leads NORTH.\nYour bedchamber is to the SOUTH.",
      {},
      {},
      {},
      {},
      {},
      { south: chambers, west: room_arya, north: north_gate },
      { name: "hallway" },
    ];
    room = setup_room(room);
    to_print("\nHALLWAY:\n You are in hallway of your living quarters.");
    if (global_vars["cat_mad"]) {
      room[6]["north"] =
        "You should not stray too far from your wife while she is upset.";
    }
    return room;
  };

  var kitchen = function () {
    to_print("\nKITCHEN:\n You enter the kitchen.");
    var room = [
      "An enormous pot of soup bubbles unattended on the fire.\nA swinging door to the SOUTH leads back to the hall.",
      { "": "" },
      { "": "" },
      {
        soup: "You put your nose over it and breath deep. You have smelled better soups, but ingredients are hard to come by in the north.",
        pot: "It's the largest pot you've ever seen.",
      },
      { "": "" },
      {
        onion:
          "You are not hungry. Besides, you have a feeling you'll need it later.",
        cloak: use_cloak,
        "onion-pot": soup_ingredient,
        "pepper-pot": soup_ingredient,
        "flagon-pot": flagon,
        "onion-soup": soup_ingredient,
        "pepper-soup": soup_ingredient,
        "flagon-soup": flagon,
      },
      { south: hall },
      { name: "kitchen" },
    ];
    room = setup_room(room);
    if (global_vars["onion"] && global_vars["pepper"]) {
      room[3]["soup"] = "The soup smells delicious now!";
      room[3]["pot"] = "The soup smells delicious now!";
    }
    return room;
  };

  var north_gate = function () {
    to_print(
      "\nNORTH GATE:\n You are standing in front of Winterfell's North Gate.",
    );
    var room = [
      "The monolithic North Gate stands near-impenatrable to outside forces.\nFrom here, the road leads to Last Hearth, then to the Wall beyond.\nA guard stands at the entrance to Robert's quarters to the EAST.\nA raven flies from the rookery tower to the WEST.\nThe stairway to your quarters leads back SOUTH.",
      {},
      {},
      { guard: "Robert's guard is much larger than you are." },
      {
        guard:
          '"Stand aside." you tell the gard. "Apologies, m\'lord," says the guard, "but my orders come direct from the king."',
      },
      { "note-guard": note_guard, "dirk-guard": "That would not be wise." },
      {
        east: room_robert,
        west: rookery,
        south: hallway,
        north:
          "The lord of Wintefell must not leave while the king is a guest under his roof.",
      },
      { name: "north_gate" },
    ];
    room = setup_room(room);
    if (global_vars["note_guard"]) {
      room[4]["guard"] = '"At your command, Lord Stark."';
    }
    return room;
  };

  var room_arya = function () {
    var room = [
      "Arya's room is a mess.\nHer clothes are flung over every surface and mud is tracked onto the rug.\nHer door opens into the hallway to the EAST.",
      { dirk: "A dirk with a bone hilt rests on a rough-hewn table." },
      { dirk: "Its blade is razor sharp." },
      {
        table:
          "The table is sturdy. Winterfell's craftsmen are skilled. \n'Arya' is carved into the tabletop.",
        clothes: "They are a young girl's clothes. You don't need them.",
      },
      {},
      {
        "dirk-table":
          "Arya has already carved her name into the tabletop. You do not need to add yours.",
      },
      { east: hallway },
      { name: "room_arya" },
    ];
    room = setup_room(room);
    to_print("\nARYA'S ROOM:\n You enter your youngest daughter's room.");
    return room;
  };

  var room_robert = function () {
    to_print("\nGUEST HOUSE:\n You enter Robert's quarters.");
    var room = [
      "The shades are drawn, and the darkened room smells of stale wine and chicken grease.\nKing Robert sits on the floor, propped against the foot of his bed.\nHe looks very drunk.\nYou see a large Gate through his open door to the WEST.",
      {},
      {},
      {
        table: "It's a table.",
        robert: "Robert's face has grown old since you saw him last.",
        bed: "Robert's bed is unmade and littered in chicken bones.",
      },
      { robert: '"Be a friend and find me more wine, would you Ned?"' },
      {
        "knife-robert": knife_robert,
        "dirk-robert":
          "Yes, Robert can be difficult, but you do not wish him dead.",
      },
      { west: north_gate },
      { name: "room_robert" },
    ];
    room = setup_room(room);
    if (global_vars["assassin_attack"]) {
      room[4]["robert"] =
        'You tell the king about the assassin in the godswood. \n"I\'d have thought your castle to be safer, Ned.\nNow let me drink in peace."';
    }
    if (global_vars["robert_scroll"]) {
      room[0] =
        "Robert sits at the table, writing a letter. \n You see the North Gate through his open door to the WEST.";
      room[4]["robert"] = '"There\'s no time to talk, Ned. Move."';
    }
    return room;
  };

  var yard = function () {
    to_print(
      "\nYARD:\n You are standing in Winterfell's central yard. The air smells of wet earth.",
    );
    var room = [
      "Stone walls encircle the yard.\nYour son Bran and your bastard Jon practice archery in one corner, in the shade of a pepper tree.\nA stained glass door leads into the Glass Gardens to the NORTH.\nA stone archway leads SOUTH.\nHeavy wooden doors open into a large building to the EAST.\nA staircase descends underground to the WEST.",
      { "": "" },
      {
        pepper: "The pepper corns are small, but potent.",
        glass: "The glass gardens lie to your north.",
      },
      {
        window:
          "Catelyn stands at window. She smiles when her eyes meet yours.",
        bran: "Soon your boy will be a man grown.  Well, not that soon.",
        jon: "Jon tells Bran to hold his breath when he aims. He has always loved the boy.",
      },
      {
        bran: '"Keep practicing, child, skill comes with time."',
        jon: '"You\'re becoming a man grown, Jon. Teach Bran well."',
      },
      {
        "dirk-bran": '"Kill my child? I think not."',
        "dirk-jon": '"He may be a bastard but I have much love for him still."',
      },
      { north: glass_gardens, east: hall, west: crypts, south: godswood },
      { name: "yard" },
    ];
    room = setup_room(room);
    if (global_vars["cloak_status"] === false) {
      room[6]["west"] =
        "You begin to descend the dark stairs, but the cold bites you to the bone. You turn back towards the yard.";
    }
    if (global_vars["robert"]) {
      room[6]["west"] = crypts_robert;
    }
    return room;
  };

  var rookery = function () {
    to_print(
      "\nROOKERY:\n You enter the rookery. A raven hops down off its perch and inspects you.",
    );
    var room = [
      "The rookery is not a wide room, but it extends upwards forty feet or more.\nBeams and rafters crisscross its open middle.\nThe floor is covered in straw and white with droppings.\nYou look up and see several ravens roosting, their heads tucked beneath ruffled wings.\nThe maesters use them to send messages across great distances.\nYou can see a large Gate through the doorway to the EAST.",
      {},
      {},
      {
        raven:
          "The raven has slick black feathers. There is a string around its leg used to attach small messages.",
        string: "A small string dangles from the raven's leg.",
        straw: "The straw is white with raven droppings.",
      },
      { raven: '"Corn! Corn!" is all the bird seems able to say.' },
      {
        "scroll-raven": scroll_raven,
        "scroll-string": scroll_raven,
        "note-raven": "You have no need to send this note away.",
      },
      { east: north_gate },
      { name: "rookery" },
    ];
    room = setup_room(room);
    return room;
  };
  /*
var rooms = {"chambers":chambers,
"hall":hall,
"hallway":hallway,
"glass_gardens":glass_gardens,
"room_arya":room_arya,
"north_gate":north_gate};
*/
  var global_actions = {
    onion:
      "You are not hungry. Besides, you have a feeling you'll need it later.",
    dirk: '"Ah, sweet release. But my people depend on me."',
    cloak: use_cloak,
    pepper: '"ACHOO!"',
  };

  var jqconsole = $("#console").jqconsole("", "> ");

  var loop = function (thisroom) {
    var room = thisroom;

    //update the room with any changes
    if (typeof room == "object") {
      room = update_room(room);
    }

    jqconsole.Prompt(true, function (action) {
      console.log($(document.activeElement));
      action = action
        .toLowerCase()
        .split(" ")
        .map((w) => w.trim())
        .filter((w) => !!w && !["to", "at", "the", "with", "a"].includes(w));
      //see if it's time to fight the assassin
      action = test_action(action, room);
      if (action[0] === "go") {
        function getDirection(input) {
          switch (input) {
            case "n":
            case "north":
              return "north";
            case "s":
            case "south":
              return "south";
            case "e":
            case "east":
              return "east";
            case "w":
            case "west":
              return "west";
          }
        }
        room = go_to(getDirection(action[1]), room);
        console.log(typeof room);
        if (typeof room === "object") {
          loop(room);
        } else {
          loop(room());
        }
      } else if (action[0] == "help") {
        help();
      } else if (action[0] == "look") {
        look(action, room);
      } else if (action[0] == "take") {
        if (action.length > 1) {
          room = take(action[1], room);
        } else {
          to_print("Take what?");
        }
      } else if (action[0] == "use") {
        use(action, room);
      } else if (action[0] == "talk") {
        if (action.length > 1) {
          talk(action[1], room);
        } else {
          to_print("You curse yourself under your breath.");
        }
      } else if (action[0] == "inv" || action[0] === "i") {
        get_inv();
      } else if (action[0] == "map") {
        $.colorbox({
          href: "/gameoftext/gotmap.jpg",
          returnFocus: "true",
          onClosed: function () {
            document.getElementById("console").focus();
            $("textarea").focus();
          },
        });
      } else if (!global_vars["playing"]) {
        return null;
      } else {
        to_print("Your actions yield no result.");
      }
      loop(room);
    });
  };
  to_print(
    ".__.  .__ .__..  ..___  .__..___  .___..___\\  /.___.\n[__]  [ __[__]|\\/|[__   |  |[__     |  [__  ><   |  \n|  |  [_./|  ||  |[___  |__||       |  [___/  \\  | \n\n\nCOMMANDS:\nlook = look around the area\nlook [object] = look at an object in the room or your inventory\ntake [object] = pick up item\nuse [item] = use an item from your inventory on yourself\nuse [item] [object] = use an item from your inventory on something in the room\ngo [north/south/east/west] = go to adjacent area\ntalk [person] = talk to a person in the room\ninv = view inventory\nhelp = print these instructions to the screen\n\n\nA letter arrives from King's Landing:\n\n\t***************************************************\n\tNed,\n\tJon Arryn is dead.\n\tI will be arriving in Winterfell in two week's time.\n\t-Robert\n\t***************************************************\n\nTwo weeks later, King Robert arrives with his men.\nHe asks that you replace Jon as Hand of the King.\nAgainst your better judgement, you accept his offer.\nRobert is pleased.\nYour wife, Catelyn, will not be.\nYou walk to your bedchambers...\n",
  );
  loop(chambers());
});
