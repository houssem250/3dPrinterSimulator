Fix size of model :
    1- get bed dimention of .glb model 
    2- resize model by it's bed dimension and unify unity to 1 or 0.1 to make calculation much easier (so bed will be 100mm*100mm), we call the factor of resize and we resize the whole model
    3- we already scale the model by x10 in printer config  so we nead to resize model before scaling 
    4- now from printer config there is  AXES MAX_TRAVEL_MM for each axis and Bed WIDTH_MM and HEIGHT_MM all those has value 300 by default so basically it's obvious they has relationship with each other , 300mm and we the 100mm of the the bed so we need second factor to calc it's for inner scaling 
    finally we have the model resized than  we scale it the last time with MODEL.SCALE = 10 that we have 

    NOTE : we have in BaseAxis class this.maxTravel  = config.maxTravel  ?? 220; the 220 is suspecious 

fix nozzle start position and home c
    1- in intial state , get the position of the center of the bed
    2- get the position of nozzle (as I remeber it's not directly)
    3- Calc the Dalta between them 
    4- get the env home (x=0,y=0,z=0)  
    5- calc Delta of the bed center and env(x=0,y=0)
    6- calc Delta of the bed center and nozzle
    7- One we start printing before that , move bed to placement, but placement must be checked in calc , we have corner and center, check their values
    